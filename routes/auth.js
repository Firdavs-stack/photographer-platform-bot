// auth.js
const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const BOT_TOKEN = "7456265736:AAH8zdizZ8nvXo2N8kTHmOWIO9yn-1TYYU8";

router.post("/telegram-auth", (req, res) => {
	const { hash, ...data } = req.body;

	const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest();

	const checkString = Object.keys(data)
		.sort()
		.map((key) => `${key}=${data[key]}`)
		.join("\n");

	const hmac = crypto
		.createHmac("sha256", secretKey)
		.update(checkString)
		.digest("hex");

	if (hmac === hash) {
		// Подпись корректна
		res.json({ success: true, user: data });
	} else {
		// Подпись некорректна
		res.status(401).json({ success: false, message: "Invalid hash" });
	}
});

module.exports = router;
