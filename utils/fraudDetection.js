const Transaction = require('../models/Transaction');

exports.detectFraud = async (userId, transaction) => {
  // Check for multiple transfers in a short period (last hour)
  if (transaction.type === 'TRANSFER') {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTransfers = await Transaction.find({
      fromUserId: userId,
      type: 'TRANSFER',
      createdAt: { $gte: oneHourAgo }
    });
    
    if (recentTransfers.length >= 5) {
      return 'Multiple transfers in a short period';
    }
  }
  
  // Check for large withdrawal
  if (transaction.type === 'WITHDRAWAL' && transaction.amount > 1000) {
    return 'Large withdrawal';
  }
  
  // Check for unusual activity (sudden large transaction)
  const pastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentTransactions = await Transaction.find({
    $or: [
      { fromUserId: userId },
      { toUserId: userId }
    ],
    createdAt: { $gte: pastMonth }
  });
  
  if (recentTransactions.length > 0) {
    const avgAmount = recentTransactions.reduce((sum, t) => sum + t.amount, 0) / recentTransactions.length;
    if (transaction.amount > avgAmount * 3) {
      return 'Transaction amount significantly higher than average';
    }
  }
  
  return null;
};