const User = require("../models/user.model.js");
const Bank = require("../models/bank.model.js");
const Epin = require("../models/epin.model.js");

const { ApiError } = require("../utils/ApiError.js");
const { ApiResponse } = require("../utils/ApiResponse.js");
const { catchAsyncErrors } = require("../middlewares/catchAsyncErrors.js");
const Team = require("../models/team.model.js");
const crypto = require("crypto");
const fs = require("fs");

const nodemailer = require("nodemailer");
const { uploadOnCloudinary, updateOnCloudinary } = require("../utils/cloudinary.js");
const MailSender = require("../utils/Nodemailer.js");

const transporter = nodemailer.createTransport({
	service: "Gmail",
	auth: {
		user: process.env.NODEMAILER_EMAIL,
		pass: process.env.NODEMAILER_PASSWORD,
	},
});

// ?? Admin Register Handler
exports.registerUser = catchAsyncErrors(async (req, res) => {
	const { firstName, lastName, email, contact, city, postalCode, state, password, role, referralCode } = req.body;

	if (!firstName || !lastName || !email || !contact || !city || !postalCode || !state || !password) {
		throw new ApiError(400, "All fields are required");
	}
	if (req.files["avatar"] === undefined) {
		throw new ApiError(404, "Avatar file is required");
	}
	if (req.files["aadhar"] === undefined) {
		throw new ApiError(404, "Aadhar file is required");
	}
	if (req.files["pan"] === undefined) {
		throw new ApiError(404, "Pan file is required");
	}

	const avatar = req?.files["avatar"][0];
	const aadhar = req?.files["aadhar"][0];
	const pan = req?.files["pan"][0];

	const uploadedAvatar = await uploadOnCloudinary(avatar?.path);
	const uploadedAadhar = await uploadOnCloudinary(aadhar?.path);
	const uploadedPan = await uploadOnCloudinary(pan?.path);
	console.log(uploadedAvatar, uploadedAadhar, uploadedPan);
	if (!uploadedAvatar) {
		return res.status(404).json({ message: "avatar is required" });
	}
	if (!uploadedAadhar) {
		return res.status(404).json({ message: "aadhar is required" });
	}
	if (!uploadedPan) {
		return res.status(404).json({ message: "pan card is required" });
	}

	const existedUser = await User.findOne({
		$or: [{ email }, { contact }],
	});
	console.log(existedUser);
	if (existedUser) {
		return res.status(404).json({ message: "user already exists" });
	}
	console.log(374477);

	const user = await User.create({
		firstName,
		lastName,
		email,
		contact,
		password,
		role: role || "user",
		city,
		postalCode,
		state: state,
		aadharCard: uploadedAadhar.url,
		panCard: uploadedPan.url,
		avatar: uploadedAvatar.url,
		track: {
			code: referralCode,
			step: 1,
		},
	});

	if (!user) {
		fs.unlinkSync(`./public/uploads/${aadhar}`);
		fs.unlinkSync(`./public/uploads/${pan}`);
		fs.unlinkSync(`./public/uploads/${avatar}`);
		throw new ApiError(500, "Something went wrong while registering the user! Maybe an Internet Connection issue");
	}

	const code = await generateReferralCode(user._id.toString());

	user.referralCode = code;

	// const mail = {
	// 	name: user.firstName + " " + user.lastName,
	// 	email: user.email,
	// };

	// await sendRegistrationMail(mail);

	await user.save();

	const createdUser = await User.findById(user._id).select("-password");

	if (!createdUser) {
		throw new ApiError(500, "Something went wrong while registering the user! Maybe an Internet Connection issue");
	}

	return res.status(201).json(new ApiResponse(200, { createdUser, referralCode }, "User registered"));
});

exports.updateImages = catchAsyncErrors(async (req, res) => {
	const user = await User.findById(req.user._id);
	if (!user) {
		if (req?.files?.aadhar) fs.unlinkSync(req?.files?.aadhar[0]?.path);
		if (req?.files?.pan) fs.unlinkSync(req?.files?.pan[0]?.path);
		if (req?.files?.avatar) fs.unlinkSync(req?.files?.avatar[0]?.path);
		throw new ApiError(409, "user not find");
	}
	console.log(req.files);
	const avatar = req?.files["avatar"][0];
	const aadhar = req?.files["aadhar"][0];
	const pan = req?.files["pan"][0];

	if (avatar) {
		const uploadedAvatar = await updateOnCloudinary(avatar?.path, req?.user?.avatar);
		user.avatar = uploadedAvatar.url;
	}
	if (aadhar) {
		const uploadedAadhar = await updateOnCloudinary(aadhar?.path, req?.user?.aadharCard);
		user.aadharCard = uploadedAadhar.url;
	}
	if (pan) {
		const uploadedPan = await updateOnCloudinary(pan?.path, req?.user?.panCard);
		user.panCard = uploadedPan.url;
	}

	await user.save();

	return res.status(201).json(new ApiResponse(200, "User images Updated Successfully"));
});

// ?? Admin Login Handler
exports.loginUser = catchAsyncErrors(async (req, res) => {
	const { email, password } = req.body;
	if (!email || !password) {
		throw new ApiError(400, "phone number or username and password is required is required");
	}
	const user = await User.findOne({
		email,
	}).select("+password");
	// console.log(user);
	if (!user) {
		throw new ApiError(401, "Invalid user credentials");
	}

	const isPasswordValid = await user.comparePassword(password);

	if (!isPasswordValid) {
		throw new ApiError(401, "Invalid user credentials");
	}

	// Update lastActive field
	user.lastActive = Date.now();
	await user.save();

	const token = await user.getJwtToken();

	const options = {
		expires: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
		httpOnly: true,
		// secure: true,
	};
	const userWithoutPassword = { ...user.toObject() };
	delete userWithoutPassword.password;
	delete userWithoutPassword.resetPasswordToken;

	user.activeStatus = "active";
	user.save();

	return res
		.status(200)
		.cookie("token", token, options)
		.json(
			new ApiResponse(
				200,
				{
					token,
					user: userWithoutPassword,
				},
				"User logged In"
			)
		);
});

// ?? Admin Logout Handler
exports.logoutUser = catchAsyncErrors(async (req, res) => {
	// Update lastActive field
	req.user.lastActive = Date.now();
	req.user.activeStatus = "inactive";
	await req.user.save();

	res.status(200)
		.cookie("token", null, { expires: new Date(Date.now()), httpOnly: true })
		.json(new ApiResponse(200, "Logged Out Successfully"));
});

exports.forgotPassword = catchAsyncErrors(async (req, res) => {
	console.log("Forgot Password");
	const user = await User.findOne({ email: req.body.email });

	if (!user) {
		throw new ApiError(404, "User not found");
	}

	const resetPasswordToken = user?.getResetPasswordToken();
	await user.save();

	const resetUrl = `${req.protocol}://gbt-trust.vercel.app/reset/${resetPasswordToken}`;

	const message = `
	<h2>Dear ${user.firstName} ${user.lastName},</h2>
	<p>We received a request to reset the password for your GBT account. If you did not initiate this request, you can safely ignore this email.</p>
	<strong>
	  To reset your password, click on the following link (or copy and paste it into your browser):
	</strong>
	<br>
	<a href="${resetUrl}">${resetUrl}</a>
	<br><br>
	<p>This link will expire in 10 minutes, so please reset your password promptly.</p>
	<p>If you are having trouble accessing the link, please ensure that you have copied the entire URL into your browser. If you continue to experience issues, please contact our support team at 911aaryan@gmail.com.</p>
	<p>Thank You,</p>
	<p>Team GBT - Ganpati Balaju Trust</p>
   `;

	let forgotMail = new MailSender(user.email, "GBT - Password Reset", message);
	forgotMail.send();

	res.status(200).json(new ApiResponse(201, resetUrl, `Password Reset email sent to ${user.email}`));
});

exports.resetPassword = catchAsyncErrors(async (req, res) => {
	const resetPasswordToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

	const user = await User.findOne({
		resetPasswordToken,
		resetPasswordExpire: { $gt: Date.now() },
	});

	if (!user) {
		throw new ApiError(403, "token is invalid or expired");
	}

	user.password = req.body.password;
	user.resetPasswordToken = undefined;
	user.resetPasswordExpire = undefined;
	await user.save();

	res.status(200).json(new ApiResponse(201, {}, "password reset successfully"));
});

exports.myProfile = catchAsyncErrors(async (req, res) => {
	const user = await User.findById(req.user._id);
	if (!user) {
		throw new ApiError(404, "User not found");
	}
	res.status(200).json(new ApiResponse(200, { success: true, user }));
});

// ?? UPDATE PROFILE
exports.updateProfile = catchAsyncErrors(async (req, res) => {
	const { firstName, lastName, gender, dob, contact, whatsapp, linkedin, facebook, bankDetails } = req.body;
	const userId = req.user._id; // Assuming you're using authentication middleware to attach the user object to the request
	// Find the user by userId
	const user = await User.findById(userId);
	if (!user) {
		throw new ApiError(404, "Updation Failed");
	}
	// Update user fields if they are provided and not undefined
	if (firstName) {
		user.firstName = firstName;
	}
	if (lastName) {
		user.lastName = lastName;
	}
	if (gender) {
		user.gender = gender;
	}
	if (dob) {
		user.dob = dob;
	}
	if (contact) {
		user.contact = contact;
	}
	if (whatsapp) {
		user.whatsapp = whatsapp;
	}
	if (linkedin) {
		user.linkedin = linkedin;
	}
	if (facebook) {
		user.facebook = facebook;
	}
	// Add conditions for other fields as needed
	// Save the updated user object
	await user.save();

	// Update or create bank details if provided
	if (bankDetails) {
		let bank = await Bank.findOne({ user: userId }); // Find bank details by user ID
		if (!bank) {
			// Create bank details if not found
			bank = new Bank({
				user: userId,
				accountNumber: bankDetails.accountNumber,
				ifscCode: bankDetails.ifscCode,
				accountType: bankDetails.accountType,
				accountHolderName: bankDetails.accountHolderName,
			});
		} else {
			// Update bank details if found
			if (bankDetails.accountNumber !== undefined) {
				bank.accountNumber = bankDetails.accountNumber;
			}
			if (bankDetails.ifscCode !== undefined) {
				bank.ifscCode = bankDetails.ifscCode;
			}
			if (bankDetails.accountHolderName !== undefined) {
				bank.accountHolderName = bankDetails.accountHolderName;
			}
			if (bankDetails.accountType !== undefined) {
				bank.accountType = bankDetails.accountType;
			}
		}
		await bank.save();
	}

	res.status(200).json(new ApiResponse(200, user, "Profile updated successfully"));
});

// ?? get team details
exports.getTeamMembers = catchAsyncErrors(async (req, res) => {
	const teams = await User.findById(req.user._id).populate("refers");
	if (!teams) {
		throw new ApiError(404, "teams not found");
	}
	res.status(200).json(new ApiResponse(200, { success: true, teams: teams.refers }));
});

// ?? Track user
exports.trackUser = catchAsyncErrors(async (req, res) => {
	const user = await User.findOne({ email: req.query.email }).populate("parent");
	if (!user) {
		throw new ApiError(404, "user not found");
	}

	res.status(200).json(new ApiResponse(200, user.track));
});

// ?? Team Rising Star Handler
exports.risingStars = catchAsyncErrors(async (req, res) => {
	const users = await User.find({ role: "user" }).sort({ referralIncome: -1 }).limit(10);

	if (!users) {
		throw new ApiError(404, "No user found");
	}

	return res.status(200).json(new ApiResponse(200, users, "Top 10 Rising Stars"));
});

exports.sendMail = catchAsyncErrors(async (req, res) => {
	const mailOptions = {
		from: process.env.NODEMAILER_EMAIL,
		to: req.body.email,
		subject: "Invitation Regarding Program/Event.",
		html: "I hope this email finds you well. We are excited to extend an invitation to you for [provide details about the event/program/platform].",
	};
	transporter.sendMail(mailOptions, (error, info) => {
		if (error) {
			throw new ApiError(404, error, "Email not sent");
		}
	});
	// console.log(information);
	return res.status(200).json(new ApiResponse(200, information, "Email sent successfully"));
});

// ?? Single User Handler
exports.singleUser = catchAsyncErrors(async (req, res) => {
	// const users = await User.find({ role: "user" }).sort({ referralIncome: -1 }).limit(10);
	const user = await User.findById(req?.params?.id || req?.query?.id);

	if (!user) {
		throw new ApiError(404, "No user found");
	}

	return res.status(200).json(new ApiResponse(200, user, "Used Details"));
});

// ?? All Users Handler
exports.allUsers = catchAsyncErrors(async (req, res) => {
	// const users = await User.find({ role: "user" }).sort({ referralIncome: -1 }).limit(10);
	const users = await User.find().sort({ userId: -1 });

	if (!users) {
		throw new ApiError(404, "No user found");
	}

	return res.status(200).json(new ApiResponse(200, users, "All Users Details"));
});

// ?? get all users rank wise below the current user
exports.getAllUserBelow = catchAsyncErrors(async (req, res) => {
	const id = req.query.id || req.user._id;
	const users = await fetchReferralUsers(id);

	const rankMap = {
		1: "JOINING",
		2: "JOINING",
		3: "JOINING",
		4: "JOINING",
		5: "JOINING",
		6: "JOINING",
		7: "JOINING",
		8: "JOINING",
		9: "JOINING",
		10: "SILVER",
		11: "GOLD",
		12: "STARGOLD",
		13: "PLATINUM",
		14: "EMRALD",
		15: "RUBI",
		16: "DIAMOND",
		17: "DOUBLE DIAMOND",
		18: "STAR DIAMOND",
		19: "CROWN",
		20: "STAR CROWN",
		21: "DOUBLE CROWN",
	};

	let level = 0;
	const length = users.length - 1;
	console.log(length);
	if (length >= 1 && length <= 1) {
		level = 0;
	} else if (length >= 2 && length <= 5) {
		level = 1;
	} else if (length >= 6 && length <= 13) {
		level = 2;
	} else if (length >= 14 && length <= 29) {
		level = 3;
	} else if (length >= 30 && length <= 61) {
		level = 4;
	} else if (length >= 62 && length <= 125) {
		level = 5;
	} else if (length >= 126 && length <= 253) {
		level = 6;
	} else if (length >= 254 && length <= 509) {
		level = 7;
	} else if (length >= 510 && length <= 1021) {
		level = 8;
	} else if (length >= 1022 && length <= 2045) {
		level = 9;
	} else if (length >= 2046 && length <= 4093) {
		level = 10;
	} else if (length >= 4094 && length <= 8189) {
		level = 11;
	} else if (length >= 8190 && length <= 16381) {
		level = 12;
	} else if (length >= 16382 && length <= 32765) {
		level = 13;
	} else if (length >= 32766 && length <= 65533) {
		level = 14;
	} else if (length >= 65534 && length <= 131069) {
		level = 15;
	} else if (length >= 131070 && length <= 262141) {
		level = 16;
	} else if (length >= 262142 && length <= 524285) {
		level = 17;
	} else if (length >= 524286 && length <= 1048573) {
		level = 18;
	} else if (length >= 1048574 && length <= 2097153) {
		level = 19;
	} else if (length >= 2097154 && length <= 4194309) {
		level = 20;
	} else if (length >= 4194310) {
		level = 21;
	}

	const currUser = await User.findById(req.user._id);
	if (currUser.level.toString() !== level.toString() && currUser && currUser.role === "user") {
		currUser.level = level.toString();
		currUser.rank = rankMap[level];
		await currUser.save();
	}
	if (!users.length) {
		throw new ApiError(404, "No referred users found");
	}
	return res.status(200).json(new ApiResponse(200, users, "Referred Users Details"));
});

async function fetchReferralUsers(userId, users = []) {
	const user = await User.findById(userId).populate("refers");

	if (!user) {
		return [];
	}

	users.push(user);

	for (const referredUser of user.refers) {
		await fetchReferralUsers(referredUser._id, users);
	}

	return users;
}

// ?? TEAM CONTROLLERS

// ? GROUP CREATION

exports.newGroup = catchAsyncErrors(async (req, res) => {
	const { groupName, groupMembers } = req.body;

	// Map over groupMembers and find corresponding users
	const users = await Promise.all(
		groupMembers.map(async (member) => {
			const user = await User.findOne({ $or: [{ email: member }, { contact: member }] });
			if (!user) {
				throw new ApiError(404, `User with email or contact ${member} does not exist`);
			}
			return user._id;
		})
	);

	// Create new team with group members
	const group = await Team.create({
		groupName,
		groupMembers: users, // Assign resolved user IDs
	});

	// Check if group is created successfully
	if (!group) {
		throw new ApiError(404, "No group found");
	}

	// Send success response
	return res.status(200).json(new ApiResponse(200, group, "Group Created Successfully"));
});

// ?? GROUP UPDATE
exports.updateGroup = catchAsyncErrors(async (req, res) => {
	const { groupName, groupMembers } = req.body;

	// Map over groupMembers and find corresponding users
	const users = await Promise.all(
		groupMembers.map(async (member) => {
			const user = await User.findOne({ $or: [{ email: member }, { contact: member }] });
			if (!user) {
				throw new ApiError(404, `User with email or contact ${member} does not exist`);
			}
			return user._id;
		})
	);

	// Create new team with group members
	const group = await Team.create({
		groupName,
		groupMembers: users, // Assign resolved user IDs
	});

	// Check if group is created successfully
	if (!group) {
		throw new ApiError(404, "No group found");
	}

	// Send success response
	return res.status(200).json(new ApiResponse(200, group, "Group Created Successfully"));
});

// ?? Epin Generator Handler
exports.epinGenerator = catchAsyncErrors(async (req, res) => {
	try {
		const { memberId, numberOfPins } = req.body;

		// Generate ePINs based on memberId and numberOfPins
		const ePins = generateEPINs(memberId, numberOfPins);

		// For demonstration purposes, we'll just log the generated ePINs
		console.log(`Generated ePINs for Member ID ${memberId}:`, ePins);

		// You can perform further processing like saving ePINs to the database, etc.

		const user = await User.findById(memberId);

		await user.epinManager.epin.push(ePins.toString());
		user.totalEpin += `${numberOfPins}`;
		user.epinManager.isRedeem = true;
		user.epinManager.status = "allocated";
		await user.save();
		console.log(user);

		// Send success response
		return res.status(200).json(new ApiResponse(200, ePins, `Successfully generated ${numberOfPins} ePIN(s) for Member ID ${memberId}`));
	} catch (error) {
		throw new ApiError(404, "Error generating ePINs:");
	}
});

// Controller function to generate the user tree
exports.generateUserTree = catchAsyncErrors(async (req, res) => {
	const { userId } = req.query; // Assuming the user ID is passed in the request parameters

	// Generate the tree starting from the specified root user
	const tree = await generateTree(userId, 0);

	// Return the generated tree
	res.status(200).json(new ApiResponse(200, tree, "Tree Generated Successfully"));
});

// Controller to Find Active users
exports.activeUsers = catchAsyncErrors(async (req, res) => {
	const users = await User.find({ activeStatus: "active" });
	if (!users) {
		throw new ApiError(404, "No active users found");
	}
	res.status(200).json(new ApiResponse(200, users, "Active Users Found Successfully"));
});

// Function to generate ePINs based on Member ID and numberOfPins
function generateEPINs(memberId, numberOfPins) {
	const ePins = [];
	for (let i = 0; i < numberOfPins; i++) {
		const ePin = generateSecureEPIN(memberId);
		ePins.push(ePin);
	}
	return ePins;
}

// Function to generate a secure ePIN using crypto module
function generateSecureEPIN(memberId) {
	// Concatenate memberId with a random string for added security
	const secret = memberId + generateRandomString();

	// Generate SHA-256 hash of the concatenated string
	const hash = crypto.createHash("sha256");
	hash.update(secret);
	const ePin = hash.digest("hex").substring(0, 8); // Take the first 8 characters of the hash as ePIN

	return ePin;
}

// Function to generate a random string for salting
function generateRandomString() {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Function to generate a referral code for a given user ID
async function generateReferralCode(userId) {
	const user = await User.findById(userId);

	const secretKey = `${user.email}${user.contact}${Date.now()}`.toString(); // Replace with your secret key
	const hash = crypto.createHmac("sha256", secretKey).update(userId).digest("hex");
	return hash.substring(0, 8); // Use the first 8 characters of the hash as the referral code
}

// Function to get the base URL of the current request
function getBaseUrl(req) {
	return `${req.protocol}://${req.get("host")}/api/v1/user`;
}

// !! tree formation
// Function to recursively generate the tree nodes
async function generateTree(userId, depth) {
	const user = await User.findById(userId);
	if (!user) return null;

	const name = `${user.firstName} ${user.lastName}`;
	const attributes = {
		rank: user.rank,
	};
	const children = [];

	// Fetch the children IDs from the database
	const childIds = user.refers;

	// Recursively generate tree nodes for each child
	for (const childId of childIds) {
		const childNode = await generateTree(childId, depth + 1);
		children.push(childNode);
	}

	return {
		name,
		attributes,
		children,
	};
}

async function updateUserActivityStatus() {
	const inactiveThreshold = 60; // 60 minutes of inactivity threshold

	const users = await User.find({ activeStatus: "active" });

	const currentTime = new Date();

	users.forEach(async (user) => {
		const lastActiveTime = user.lastActive;
		const timeDifference = currentTime - lastActiveTime;
		const minutesDifference = timeDifference / (1000 * 60);

		if (minutesDifference > inactiveThreshold) {
			user.activeStatus = "inactive";
			await user.save();
		}
	});
}

// ?? setting the approval status
exports.verifyUser = catchAsyncErrors(async (req, res) => {
	const id = req.query.id;
	const { status } = req.body;

	const user = await User.findById(id);
	if (!user) {
		throw new ApiError(403, "User not found");
	}

	user.verified = status === true ? "approved" : "rejected";
	user.track = {
		code: user.track.code,
		step: 3,
	};
	const savedUser = await user.save();
	// Return the generated tree
	res.status(200).json(
		new ApiResponse(200, { referralCode: savedUser.track.code, userid: savedUser._id }, status === true ? "user approved" : "user not approved")
	);
});

// Run this function periodically using setInterval or a job scheduler

setInterval(updateUserActivityStatus, 1000 * 60 * 1); // Check in every 1/2 hrs

// 192.168.93.164

// ?? Referral Code GENERATOR
exports.referralCodeGenerate = catchAsyncErrors(async (req, res) => {
	try {
		if (req.user.referralCode !== undefined) {
			return res.status(200).json(new ApiResponse(200, req.user.referralCode, "Referral code already generated"));
		}
		// console.log(req.user._id.toString());
		const { _id } = req.user;
		const userId = _id.toString();
		// Generate a unique referral code
		const referralCode = await generateReferralCode(userId);

		// Update the user's record with the generated referral code
		const updatedUser = await User.findByIdAndUpdate(userId, { referralCode }, { new: true });

		if (!updatedUser) {
			return res.status(404).json(new ApiResponse(404, null, "User not found"));
		}

		return res.status(200).json(new ApiResponse(200, updatedUser, "Referral code generated successfully"));
	} catch (error) {
		throw new ApiError(404, "Error generating referral code");
	}
});

// ?? Referral Link GENERATOR
exports.referralLinkGenerate = catchAsyncErrors(async (req, res) => {
	const { referralCode } = req.user;
	try {
		if (!req.user) {
			throw new ApiError(404, "User not found");
		}
		req.user.referralUrl = `${getBaseUrl(req)}/referral/generated-link/:referralCode=${referralCode}`;
		await req.user.save();

		// Redirect to home page or any other page after processing the referral
		return res.status(200).json(new ApiResponse(200, req.user.referralUrl, "Referral link generated successfully"));
	} catch (error) {
		console.error("Error processing referral:", error);
		return res.status(500).json({ error: "Internal Server Error" });
	}
});

exports.updateTrack = catchAsyncErrors(async (req, res) => {
	const referralCode = req?.params?.referralCode.split("=")[1];
	if (!referralCode) {
		throw new ApiError(404, "Referral code not found");
	}
	const owner = await User.findOne({ referralCode });
	if (!owner) {
		throw new ApiError(404, "Owner not found");
	}
	if (owner.verified !== "approved") {
		throw new ApiError(404, "user is not approved");
	}

	if (owner._id === req.user._id) {
		throw new ApiError(404, "User cannot refer itself");
	}

	if (owner.refers.includes(req.user._id)) {
		throw new ApiError(401, "Referral link already accessed");
	}

	if (!owner.parent || owner.parent === null) {
		throw new ApiError(401, "Referral link already accessed");
	}

	const userBeingReferred = await User.findById(req.user._id);
	if (userBeingReferred) {
		userBeingReferred.track = {
			code: userBeingReferred.track.code,
			step: 2,
		};
		await userBeingReferred.save();
	}

	return res.status(200).json(new ApiResponse(200, owner, "Referral link accessed successfully"));
});

exports.referralLinkAccess = catchAsyncErrors(async (req, res) => {
	const referralCode = req?.params?.referralCode.split("=")[1];
	if (!referralCode) {
		throw new ApiError(404, "Referral code not found");
	}
	const owner = await User.findOne({ referralCode });
	if (!owner) {
		throw new ApiError(404, "Owner not found");
	}
	if (owner.verified !== "approved") {
		throw new ApiError(404, "user is not approved");
	}

	if (owner._id === req.user._id) {
		throw new ApiError(404, "User cannot refer itself");
	}

	if (owner.refers.includes(req.user._id)) {
		throw new ApiError(401, "Referral link already accessed");
	}

	const userBeingReferred = await User.findById(req.query.userid);
	if (userBeingReferred.parent !== undefined) {
		throw new ApiError(401, "Referral link already accessed");
	}

	owner.refers.push(req.query.userid);
	await owner.save();
	// Add parent reference to the user being referred

	if (userBeingReferred) {
		userBeingReferred.parent = owner._id;

		await userBeingReferred.save();
	}
	if (owner.refers.length % 2 === 0) {
		// Add referral bonus to owner's account
		const referralBonus = 300;
		owner.referralIncome += 300;
		owner.balance += 300;
		owner.totalBonus += 300;

		await owner.save();
		let parent = owner.parent;
		let bonusToParent = referralBonus / 2;
		while (parent) {
			const parentUser = await User.findById(parent);
			if (parentUser) {
				parentUser.balance += bonusToParent;
				parentUser.totalBonus += bonusToParent;
				parentUser.referralIncome += bonusToParent;
				await parentUser.save();
			}
			parent = parentUser.parent;
			bonusToParent /= 2; // Halve the bonus for the next parent
		}
	}

	// Redirect to home page or any other page after processing the referral
	return res.status(200).json(new ApiResponse(200, owner, "Referral link accessed successfully"));
});

// ??!! Calculating referrral amout

exports.calculateReferral = catchAsyncErrors(async (req, res) => {
	// console.log("hii");
	// const referralAmount = 1;
	const referralAmount = (await calculateMoney(req.user._id)) * 300;
	const user = await User.findById(req.user._id);
	user.referralIncome = referralAmount;
	console.log("amount = ", referralAmount);

	return res.status(200).json(new ApiResponse(200, referralAmount, "Referral link accessed successfully"));
});

exports.calculateLevel = catchAsyncErrors(async (req, res) => {
	const leveldata = await calculateLevels(req.user._id);
	console.log("level = ", leveldata);
	const user = await User.findById(req.user._id);
	user.level = leveldata;
	return res.status(200).json(new ApiResponse(200, leveldata, "Referral link accessed successfully"));
});

const calculateLevels = async (id) => {
	const user = await User.findById(id).populate("refers");
	if (user.refers.length <= 1) {
		return 0;
	}

	let arr = [];
	for (const _refer of user.refers) {
		const value = await calculateMoney(_refer);
		arr.push(value);
	}

	const map = new Map();
	for (const val of arr) {
		if (map.has(val)) {
			map.set(val, map.get(val) + 1);
		} else {
			map.set(val, 1);
		}
	}

	// console.log(map);
	let sum = 0;
	let level = 0;
	let left = -1;
	for (const [key, count] of map) {
		if (count % 2 === 1) {
			if (left == -1 && key !== 0) {
				left = key;
			} else if (left > key && key !== 0) {
				left = key;
			}
		}
		if (Math.floor(count / 2) !== 0) {
			sum += key + Math.floor(count / 2);
			level++;
		}
	}
	sum += left + 1;
	if (left !== -1) {
		level++;
	}
	return level;
};

const calculateMoney = async (id) => {
	const user = await User.findById(id).populate("refers");
	if (user.refers.length <= 1) {
		return 0;
	}

	let arr = [];
	for (const _refer of user.refers) {
		const value = await calculateMoney(_refer);
		arr.push(value);
	}

	const map = new Map();
	for (const val of arr) {
		if (map.has(val)) {
			map.set(val, map.get(val) + 1);
		} else {
			map.set(val, 1);
		}
	}

	// console.log(map);
	let sum = 0;
	let left = -1;
	for (const [key, count] of map) {
		if (count % 2 === 1) {
			if (left == -1 && key !== 0) {
				left = key;
			} else if (left > key && key !== 0) {
				left = key;
			}
		}
		if (Math.floor(count / 2) !== 0) {
			sum += key + Math.floor(count / 2);
		}
	}
	sum += left + 1;
	return sum;
	// map.set("refers", arr);
};
