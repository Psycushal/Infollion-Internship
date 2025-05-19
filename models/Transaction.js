const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'], required: true },
  currency: { type: String, default: 'USD' },
  isFlagged: { type: Boolean, default: false },
  flagReason: { type: String },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);