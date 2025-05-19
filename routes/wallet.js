const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { detectFraud } = require('../utils/fraudDetection');

const router = express.Router();

/**
 * @swagger
 * /api/wallet/balance:
 *   get:
 *     summary: Get user wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance retrieved
 *       401:
 *         description: Unauthorized
 */
router.get('/balance', async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.userId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    res.status(200).json({ balance: wallet.balance, currency: wallet.currency });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/wallet/deposit:
 *   post:
 *     summary: Deposit funds to wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Deposit successful
 *       400:
 *         description: Invalid amount
 */
router.post('/deposit', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    const wallet = await Wallet.findOne({ userId: req.user.userId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    wallet.balance += amount;
    await wallet.save({ session });
    
    const transaction = await Transaction.create([{
      toUserId: req.user.userId,
      amount,
      type: 'DEPOSIT',
      currency: wallet.currency
    }], { session });
    
    const isFraudulent = await detectFraud(req.user.userId, transaction[0]);
    if (isFraudulent) {
      transaction[0].isFlagged = true;
      transaction[0].flagReason = isFraudulent;
      await transaction[0].save({ session });
    }
    
    await session.commitTransaction();
    
    res.status(200).json({ 
      message: 'Deposit successful', 
      balance: wallet.balance,
      transaction: transaction[0]
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/wallet/withdraw:
 *   post:
 *     summary: Withdraw funds from wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Withdrawal successful
 *       400:
 *         description: Invalid amount or insufficient funds
 */
router.post('/withdraw', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    const wallet = await Wallet.findOne({ userId: req.user.userId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    if (wallet.balance < amount) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Insufficient funds' });
    }
    
    wallet.balance -= amount;
    await wallet.save({ session });
    
    const transaction = await Transaction.create([{
      fromUserId: req.user.userId,
      amount,
      type: 'WITHDRAWAL',
      currency: wallet.currency
    }], { session });
    
    const isFraudulent = await detectFraud(req.user.userId, transaction[0]);
    if (isFraudulent) {
      transaction[0].isFlagged = true;
      transaction[0].flagReason = isFraudulent;
      await transaction[0].save({ session });
    }
    
    await session.commitTransaction();
    
    res.status(200).json({ 
      message: 'Withdrawal successful', 
      balance: wallet.balance,
      transaction: transaction[0]
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/wallet/transfer:
 *   post:
 *     summary: Transfer funds to another user
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               toEmail:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Transfer successful
 *       400:
 *         description: Invalid input or insufficient funds
 *       404:
 *         description: Recipient not found
 */
router.post('/transfer', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { toEmail, amount } = req.body;
    
    if (!toEmail || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid recipient email and amount are required' });
    }
    
    const recipient = await User.findOne({ email: toEmail, isDeleted: false });
    if (!recipient) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Recipient not found' });
    }
    
    if (recipient._id.toString() === req.user.userId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Cannot transfer to your own account' });
    }
    
    const senderWallet = await Wallet.findOne({ userId: req.user.userId }).session(session);
    if (!senderWallet || senderWallet.balance < amount) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Insufficient funds' });
    }
    
    const recipientWallet = await Wallet.findOne({ userId: recipient._id }).session(session);
    if (!recipientWallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Recipient wallet not found' });
    }
    
    senderWallet.balance -= amount;
    recipientWallet.balance += amount;
    
    await senderWallet.save({ session });
    await recipientWallet.save({ session });
    
    const transaction = await Transaction.create([{
      fromUserId: req.user.userId,
      toUserId: recipient._id,
      amount,
      type: 'TRANSFER',
      currency: senderWallet.currency
    }], { session });
    
    const isFraudulent = await detectFraud(req.user.userId, transaction[0]);
    if (isFraudulent) {
      transaction[0].isFlagged = true;
      transaction[0].flagReason = isFraudulent;
      await transaction[0].save({ session });
    }
    
    await session.commitTransaction();
    
    res.status(200).json({ 
      message: 'Transfer successful', 
      balance: senderWallet.balance,
      transaction: transaction[0]
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * @swagger
 * /api/wallet/transactions:
 *   get:
 *     summary: Get user's transaction history
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction history retrieved
 */
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find({
      $or: [
        { fromUserId: req.user.userId },
        { toUserId: req.user.userId }
      ],
      isDeleted: false
    }).sort({ createdAt: -1 });
    
    res.status(200).json({ transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;