const fs = require("fs");
const nodemailer = require("nodemailer");

class MailSender {
	nodemailer;
	gmail;
	mailfrom;
	tomail;
	sub;
	message;

	constructor(to, sub, msg) {
		this.mailfrom = "rajkm9111@gmail.com";
		this.tomail = to;
		this.sub = sub;
		this.message = msg;
		this.nodemailer = nodemailer;
		this.gmail = this.nodemailer.createTransport({
			service: "gmail",
			auth: {
				user: "rajkm9111@gmail.com",
				pass: "bekipfnihtexnisv",
			},
			tls: {
				rejectUnauthorized: false, // Allow self-signed certificates
			},
		});
		console.log("Mail obj created");
	}

	send() {
		console.log("sending mail");
		var mailOptions = {
			from: this.mailfrom,
			to: this.tomail,
			subject: this.sub,
			html: this.message,
		};

		this.gmail.sendMail(mailOptions, function (error, info) {
			if (error) {
				console.log(error);
			} else {
				console.log("Email sent : " + info.response);
			}
		});
	}
}

module.exports = MailSender;
