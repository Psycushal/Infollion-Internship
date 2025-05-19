const express = require('express');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/admin/flagged-transactions:
 *   get:
 *     summary: Get all flagged transactions
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Flagged transactions retrieved
 *       403:
 *         description: Admin access required
 */
router.get('/flagged-transactions', isAdmin, async (req, res) => {
  try {
    const flaggedTransactions = await Transaction.find({ 
      isFlagged: true,
      isDeleted: false
    })
    .populate('fromUserId', 'email')
    .populate('toUserId', 'email')
    .sort({ createdAt: -1 });
    
    res.status(200).json({ transactions: flaggedTransactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/admin/total-balance:
 *   get:
 *     summary: Get total balance across all wallets
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total balance retrieved
 *       403:
 *         description: Admin access required
 */
router.get('/total-balance', isAdmin, async (req, res) => {
  try {
    const result = await Wallet.aggregate([
      {
        $group: {
          _id: '$currency',
          totalBalance: { $sum: '$balance' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.status(200).json({ balances: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/admin/top-users:
 *   get:
 *     summary: Get top users by balance or transaction volume
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [balance, transactions]
 *         required: true
 *         description: Sort criteria
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of users to return
 *     responses:
 *       200:
 *         description: Top users retrieved
 *       403:
 *         description: Admin access required
 */
router.get('/top-users', isAdmin, async (req, res) => {
  try {
    const { sortBy = 'balance', limit = 10 } = req.query;
    
    if (sortBy === 'balance') {
      const topUsersByBalance = await Wallet.find()
        .sort({ balance: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'email');
      
      res.status(200).json({ users: topUsersByBalance });
    } else if (sortBy === 'transactions') {
      const transactionCounts = await Transaction.aggregate([
        {
          $match: { isDeleted: false }
        },
        {
          $group: {
            _id: {
              $cond: {
                if: { $eq: ['$type', 'TRANSFER'] },
                then: '$fromUserId',
                else: {
                  $cond: {
                    if: { $eq: ['$type', 'DEPOSIT'] },
                    then: '$toUserId',
                    else: '$fromUserId'
                  }
                }
              }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) }
      ]);
      
      // Fetch user details
      const userIds = transactionCounts.map(item => item._id);
      const users = await User.find({ _id: { $in: userIds } }, 'email');
      
      const result = transactionCounts.map(item => {
        const user = users.find(u => u._id.toString() === item._id.toString());
        return {
          userId: item._id,
          email: user ? user.email : 'Unknown',
          transactionCount: item.count,
          totalAmount: item.totalAmount
        };
      });
      
      res.status(200).json({ users: result });
    } else {
      res.status(400).json({ message: 'Invalid sort criteria' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;