const mongoose = require("mongoose");

const portfolioItemSchema = new mongoose.Schema({
	imagePath: String,
	title: String,
	category: String,
});

const photographerSchema = new mongoose.Schema({
	telegramId: String,
	phoneNumber: String,
	telegramUsername: { type: String, required: false }, // Добавляем это поле
	firstName: String,
	lastName: String,
	age: Number,
	experience: String,
	favoriteStyles: [String],
	profilePhoto: String,
	portfolio: [portfolioItemSchema],
	status: {
		type: String,
		enum: ["novice", "intermediate", "pro"], // Добавьте 'pro' в список
		required: true,
	},
	hourlyRate: Number,
	sessionTypes: [String],
	schedule: [
		{
			date: { type: Date, required: true },
			availableSlots: [String],
		},
	],
	hasPastDates: Boolean,
	paymentDetails: { type: String }, // Новое поле для реквизитов
});

module.exports = mongoose.model("Photographer", photographerSchema);
