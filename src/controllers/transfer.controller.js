const { ApiError } = require("../utils/ApiError.js");
const { ApiResponse } = require("../utils/ApiResponse.js");
const { catchAsyncErrors } = require("../middlewares/catchAsyncErrors.js");
const Transfer = require("../models/transfer.model.js");
const User = require("../models/user.model.js");
const Bank = require("../models/bank.model.js");
const { updateUserStatement, updateAwardStatement } = require("./statement.controller.js");

// ?? Admin Register Handler
exports.requestAwardTransfer = catchAsyncErrors(async (req, res) => {
	const { address, purpose, award, accountNumber, ifscCode, accountHolderName, amount, bankName, accountType, upi } = req.body;
	console.log(address, purpose, award, accountNumber, ifscCode, accountHolderName, amount, bankName, accountType, upi);

	if (!address || !purpose || !accountNumber || !ifscCode || !accountHolderName || !bankName || !accountType || !upi) {
		throw new ApiError(301, "All Fields are Required");
	}

	const userId = req.user._id;

	const isBankDetailsExist = await Bank.findOne({ user: userId });

	if (!isBankDetailsExist) {
		const bank = await Bank.create({
			user: userId,
			accountNumber,
			accountHolderName,
			ifscCode,
			accountType,
			bankName,
		});
		if (!bank) {
			throw new ApiError(501, "Error while creating bank account");
		}
	}

	const transfer = await Transfer.create({
		user: userId,
		award: award,
		purpose: purpose,
		address: address,
		amount: amount,
		type: "award",
		upi,
	});

	return res.status(201).json(new ApiResponse(200, transfer, "Withdrawal Request Initiated"));
});

exports.requestTransfer = catchAsyncErrors(async (req, res) => {
	const { accountNumber, ifscCode, accountHolderName, amount, bankName, purpose, accountType, upi } = req.body;

	if (!accountNumber && !ifscCode && !accountHolderName && !amount && !bankName && !purpose && !accountType) {
		throw new ApiError(301, "All Fields are Required");
	}

	const userId = req.user._id;

	const isBankDetailsExist = await Bank.findOne({ user: userId });

	if (!isBankDetailsExist) {
		const bank = await Bank.create({
			user: userId,
			accountNumber,
			accountHolderName,
			ifscCode,
			accountType,
			purpose,
			bankName,
		});
		if (!bank) {
			throw new ApiError(501, "Error while creating bank account");
		}
	}

	const transfer = await Transfer.create({
		user: userId,
		amount,
		upi,
	});

	const user = await User.findOne(userId);

	return res.status(201).json(new ApiResponse(200, transfer, "Withdrawal Request Initiated"));
});

exports.getAllTransferRequest = catchAsyncErrors(async (req, res) => {
	const transfers = await Transfer.find().populate("user");
	if (!transfers || transfers.length === 0) {
		throw new ApiError(404, "No transfer request found");
	}

	return res.status(201).json(new ApiResponse(200, transfers, "Success"));
});

exports.getTransferRequestById = catchAsyncErrors(async (req, res) => {
	const userId = req.user._id;

	const transfers = await Transfer.find({ user: userId }).populate("user");

	if (!transfers || transfers.length === 0) {
		throw new ApiError(404, "No transfer request found");
	}

	return res.status(201).json(new ApiResponse(200, transfers, "Success"));
});

exports.getSingleTransfer = catchAsyncErrors(async (req, res) => {
	const id = req.query.id;

	const transferdata = await Transfer.findById(id).populate("user");
	if (!transferdata) {
		throw new ApiError(404, "No transfer request found");
	}

	const bank = await Bank.findOne({ user: transferdata.user._id });

	if (!bank) {
		transferdata.status = "rejected";
		await transferdata.save();
		return res.status(201).json(new ApiResponse(200, transferdata, "Transfer Request Rejected because Bank Details not found!"));
	}
	// console.log(transferdata);
	// console.log(bank);
	const transfer = {
		transferdata,
		bank,
	};

	return res.status(201).json(new ApiResponse(200, transfer, "Success"));
});

exports.processRequest = catchAsyncErrors(async (req, res) => {
	const { transferId, action, amount, transactionId } = req.body;

	const transfer = await Transfer.findById(transferId);

	if (!transfer) {
		throw new ApiError(404, "No transfer request found");
	}

	if (!action) {
		transfer.status = "rejected";
		await transfer.save();
		return res.status(201).json(new ApiResponse(200, {}, "Transfer Request Rejected!"));
	}

	const user = await User.findById(transfer.user);
	if (!user) {
		throw new ApiError(404, "No user found");
	}

	transfer.status = "accepted";
	transfer.transactionId = transactionId;
	await transfer.save();

	user.amountWithdrawn += amount;
	await updateUserStatement(user._id, amount, transfer._id, `${user.firstName} ${user.lastName}`);
	await user.save();

	return res.status(201).json(new ApiResponse(200, transfer, "Success"));
});

exports.processAwardRequest = catchAsyncErrors(async (req, res) => {
	const { transferId, action, amount, award, transactionId } = req.body;

	const transfer = await Transfer.findById(transferId);

	if (!transfer) {
		throw new ApiError(404, "No transfer request found");
	}

	if (!action) {
		transfer.status = "rejected";
		await transfer.save();
		return res.status(201).json(new ApiResponse(200, {}, "Transfer Request Rejected!"));
	}

	const user = await User.findById(transfer.user);
	if (!user) {
		throw new ApiError(404, "No user found");
	}

	transfer.status = "accepted";
	transfer.transactionId = transactionId;
	await transfer.save();
	// user.amountWithdrawn += amount;
	await updateAwardStatement(user._id, amount, { award, transfer });
	await user.save();

	return res.status(201).json(new ApiResponse(200, transfer, "Success"));
});
