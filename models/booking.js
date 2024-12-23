const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema({
	clientId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Client",
		required: true,
	},
	photographerId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Photographer",
		required: true,
	},
	date: { type: String, required: true }, // Дата бронирования в формате 'YYYY-MM-DD'
	timeSlot: { type: String, required: true }, // Временной промежуток, например, '14:00-15:00'
	status: {
		type: String,
		enum: [
			"awaiting_prepayment",
			"awaiting_confirmation",
			"approved",
			"confirmed",
			"completed",
			"cancelled",
			"reschedule_requested",
		],
		default: "awaiting_prepayment",
	},
	prepayment: { type: Number, required: true, default: 0 }, // Сумма предоплаты
	paymentScreenshot: { type: String, required: false }, // ID файла скриншота оплаты
	canceledScreenshot: { type: String, required: false },
	clientName: { type: String }, // Имя клиента
	photographerName: { type: String }, // Имя фотографа
	details: { type: String }, // Дополнительные детали бронирования
	meetingAddress: { type: String }, // Адрес встречи для фотосессии
	reschedule: {
		requestedBy: {
			type: String,
			enum: ["client", "photographer"],
			required: false,
		},
		newDate: { type: String, required: false },
		newTimeSlot: { type: String, required: false },
		status: {
			type: String,
			enum: ["pending", "accepted", "declined"],
			required: false,
		},
	},
	// Новое поле для проверки, является ли клиент VIP
	isVip: { type: Boolean, default: false }, // Статус VIP клиента
	price: Number, // Добавлено поле для суммы
	discount: Number, // Добавлено поле для скидки
});

module.exports = mongoose.model("Booking", BookingSchema);
