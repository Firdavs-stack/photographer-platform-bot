const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
	telegramId: String,
	telegramUsername: { type: String, required: false }, // Добавляем это поле
	name: String,
	phone: String,
	referringPhotographerId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Photographer",
	}, // Это поле
});

const Client = mongoose.model("Client", clientSchema);

module.exports = Client;
