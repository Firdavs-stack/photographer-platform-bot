// controllers/clientController.js

const Client = require("../models/client");
const Booking = require("../models/booking");
const Photographer = require("../models/Photographer");
const stateController = require("./stateController");
const { isDefaultCommand } = require("./photographerController");

async function handleClientStart(bot, msg, client) {
	const chatId = msg.chat.id;
	const text = msg.text;

	if (text.startsWith("/start invite_")) {
		const [_, photographerId, token] = text.split("_");

		// Найдите фотографа по `photographerId` в базе данных
		const photographer = await Photographer.findById(photographerId);
		if (!photographer) {
			bot.sendMessage(chatId, "Фотограф не найден.");
			return;
		}

		// Проверьте, что токен валиден, если вы его сохраняли для одноразового использования

		// Свяжите клиента с фотографом
		client.photographerId = photographerId;
		await client.save();

		bot.sendMessage(
			chatId,
			`Вы успешно подключены к фотографу ${photographer.firstName} ${photographer.lastName}.`
		);
	}
}
async function handleClientMessage(bot, msg, client) {
	const clientDefaultCommands = [
		"⚙️ Настройки",
		"📅 Мои бронирования",
		"👤 Мой аккаунт",
		"💳 Реквизиты",
	];
	const chatId = msg.chat.id;
	const text = msg.text;
	let state = stateController.getState(chatId);

	if (text in clientDefaultCommands) {
		return;
	}
	if (
		msg.photo ||
		msg.document ||
		msg.video ||
		msg.audio ||
		msg.text.startsWith("/")
	) {
		return;
	}

	if (isDefaultCommand(text, clientDefaultCommands) && state) {
		await stateController.clearState(chatId);
		state = null; // Обновляем переменную state после очистки
		// Продолжаем выполнение для обработки команды по умолчанию
	}
	// Handle different states
	if (state) {
		if (state.state === "awaiting_profile_update") {
			// Update client profile
			const [name, phone] = text.split(";").map((s) => s.trim());
			if (!name || !phone) {
				bot.sendMessage(
					chatId,
					"Пожалуйста, введите данные в формате 'Имя; Телефон'."
				);
				return;
			}
			client.name = name;
			client.phone = phone;
			await client.save();
			bot.sendMessage(chatId, "Ваш профиль обновлен.");
			stateController.clearState(chatId);
		} else if (state.state === "client_reschedule_date") {
			const newDate = text.trim();
			const dateObj = new Date(newDate);
			if (isNaN(dateObj)) {
				bot.sendMessage(
					chatId,
					"Пожалуйста, введите корректную дату в формате YYYY-MM-DD."
				);
				return;
			}
			stateController.updateState(chatId, {
				state: "client_reschedule_time",
				newDate,
			});
			bot.sendMessage(
				chatId,
				'Введите новое время (например, "14:00-15:00"):'
			);
			return;
		} else if (state.state === "client_reschedule_time") {
			const newDate = state.newDate;
			const newTimeSlot = text.trim();
			const booking = await Booking.findById(state.bookingId);
			const photographer = await Photographer.findById(
				booking.photographerId
			);

			// Check if photographer is available
			const schedule = photographer.schedule.find(
				(s) => s.date.toISOString().slice(0, 10) === newDate
			);
			if (!schedule || !schedule.availableSlots.includes(newTimeSlot)) {
				bot.sendMessage(
					chatId,
					"Фотограф недоступен в это время. Выберите другое."
				);
				return;
			}

			// Update booking
			booking.status = "reschedule_requested";
			booking.reschedule = {
				requestedBy: "client",
				newDate,
				newTimeSlot,
				status: "pending",
			};
			await booking.save();

			let clientUsername = client.telegramUsername
				? `@${client.telegramUsername}`
				: client.phone || "Контакт не указан";
			bot.sendMessage(
				photographer.telegramId,
				`Клиент ${client.name} (${clientUsername}) запросил перенос бронирования на ${newDate} в ${newTimeSlot}. Принять или отклонить?`
			);
			bot.sendMessage(
				chatId,
				"Запрос на перебронирование отправлен фотографу. Ожидайте подтверждения."
			);
			stateController.clearState(chatId);
			return;
		}
	}
	if (text === "⚙️ Настройки") {
		// Handle text commands
		bot.sendMessage(
			chatId,
			`Ваши данные:\nИмя: ${client.name}\nТелефон: ${client.phone}\n\nДля обновления отправьте новые данные в формате 'Имя; Телефон'.`
		);
		stateController.setState(chatId, {
			state: "awaiting_profile_update",
		});
	} else if (text === "📅 Мои бронирования") {
		const bookings = await Booking.find({ clientId: client._id });
		if (bookings.length === 0) {
			bot.sendMessage(chatId, "У вас нет бронирований.");
		} else {
			for (const booking of bookings) {
				let message = `Фотограф: ${
					booking.photographerName || "Неизвестно"
				}\nДата: ${booking.date}\nВремя: ${booking.timeSlot}\nСтатус: ${
					booking.status
				}\n`;

				const buttons = [];
				if (booking.status === "awaiting_prepayment") {
					buttons.push([
						{
							text: "✅ Подтвердить",
							callback_data: `confirm_booking_client;${booking._id}`,
						},
					]);
				}

				// Add button for rescheduling
				if (
					[
						"approved",
						"awaiting_prepayment",
						"awaiting_confirmation",
						"confirmed",
					].includes(booking.status)
				) {
					buttons.push([
						{
							text: "Перебронировать",
							callback_data: `client_reschedule;${booking._id}`,
						},
					]);
				}

				// Handle reschedule request from photographer
				if (
					booking.reschedule &&
					booking.reschedule.requestedBy === "photographer" &&
					booking.reschedule.status === "pending"
				) {
					message += `Запрос на перебронировку от фотографа: новая дата: ${booking.reschedule.newDate}, время: ${booking.reschedule.newTimeSlot}\n`;
					buttons.push([
						{
							text: "Принять",
							callback_data: `accept_reschedule_client;${booking._id}`,
						},
						{
							text: "Отклонить",
							callback_data: `decline_reschedule_client;${booking._id}`,
						},
					]);
				}

				if (buttons.length > 0) {
					bot.sendMessage(chatId, message, {
						reply_markup: { inline_keyboard: buttons },
					});
				} else {
					bot.sendMessage(chatId, message);
				}
			}
		}
	}
}

async function handleClientPhoto(bot, msg, client, state) {
	const chatId = msg.chat.id;

	if (state && state.state === "awaiting_payment") {
		const { photographerId, date, timeSlot } = state.bookingInfo;

		if (!msg.photo || msg.photo.length === 0) {
			bot.sendMessage(chatId, "Пожалуйста, отправьте скриншот оплаты.");
			return;
		}

		const photoId = msg.photo[msg.photo.length - 1].file_id;

		const newBooking = new Booking({
			clientId: client._id,
			photographerId: photographerId,
			date: date,
			timeSlot: timeSlot,
			status: "awaiting_confirmation",
			clientName: client.name,
			photographerName: "",
			paymentScreenshot: photoId,
		});

		const photographer = await Photographer.findById(photographerId);
		if (photographer) {
			newBooking.photographerName = `${photographer.firstName} ${photographer.lastName}`;
		}

		await newBooking.save();
		bot.sendMessage(
			chatId,
			"Спасибо! Ваш скриншот оплаты получен. Ожидайте подтверждения от фотографа."
		);

		if (photographer) {
			await bot.sendPhoto(
				photographer.telegramId,
				newBooking.paymentScreenshot,
				{
					caption: `Новое бронирование от клиента *${client.name}* на *${date}* в *${timeSlot}*. Пожалуйста, подтвердите или отклоните оплату.`,
					parse_mode: "Markdown",
					reply_markup: {
						inline_keyboard: [
							[
								{
									text: "✅ Подтвердить оплату",
									callback_data: `confirm_payment;${newBooking._id}`,
								},
								{
									text: "❌ Отклонить оплату",
									callback_data: `reject_payment;${newBooking._id}`,
								},
							],
						],
					},
				}
			);
		}

		stateController.clearState(chatId);
	} else {
		bot.sendMessage(
			chatId,
			"Пожалуйста, выберите дату и время для бронирования сначала."
		);
	}
}

async function getClientByTelegramId(telegramId) {
	return await Client.findOne({ telegramId: telegramId.toString() });
}

module.exports = {
	handleClientMessage,
	handleClientPhoto,
	getClientByTelegramId,
};
