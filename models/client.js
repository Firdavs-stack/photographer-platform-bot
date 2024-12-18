const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
	telegramId: String,
	telegramUsername: { type: String, required: false }, // Добавляем это поле
	name: String,
	phone: String,
	photographers: [
		{
			photographerId: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Photographer",
			}, // Ссылка на фотографа
			status: {
				type: String,
				enum: ["regular", "vip"],
				default: "regular",
			}, // Статус для каждого фотографа
		},
	],
	referringPhotographerId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Photographer",
	}, // Это поле
});

const Client = mongoose.model("Client", clientSchema);

module.exports = Client;
