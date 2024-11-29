const clientController = require("./clientController");
const photographerController = require("./photographerController");
const stateController = require("../controllers/stateController");
const Booking = require("../models/booking");
const Photographer = require("../models/Photographer");
const { ObjectId } = require("mongodb");
const Client = require("../models/client");
const booking = require("../models/booking");

// Определяем команды по умолчанию для фотографов и клиентов
const photographerDefaultCommands = [
	"📸 Добавить портфолио",
	"📅 Бронирования",
	"⚙️ Настройки",
	"🕒 Выбрать временные промежутки",
	"💳 Реквизиты",
	"🎟 Ссылка",
];
const clientDefaultCommands = [
	"⚙️ Настройки",
	"📅 Мои бронирования",
	"👤 Мой аккаунт",
];

// Функция для проверки, является ли команда командой по умолчанию
function isDefaultCommand(data, defaultCommands) {
	return defaultCommands.includes(data);
}

// Основная функция обработки callback_query
async function handleCallbackQuery(bot, query) {
	const chatId = query.message.chat.id;
	const data = query.data;
	const state = await stateController.getState(chatId);

	if (
		isDefaultCommand(data, photographerDefaultCommands) ||
		isDefaultCommand(data, clientDefaultCommands)
	) {
		return; // Прерываем выполнение, если нажата одна из стандартных кнопок
	}

	// Определяем пользователя — клиент или фотограф
	const client = await clientController.getClientByTelegramId(chatId);
	const photographer =
		await photographerController.getPhotographerByTelegramId(chatId);

	// Проверка наличия состояния перед вызовом toggleTime
	if (data.startsWith("toggle_time;")) {
		if (!photographer) {
			await bot.sendMessage(
				chatId,
				"Вы не зарегистрированы как фотограф."
			);
			return;
		}
		await toggleTime(bot, chatId, query, data, photographer, state);
		return;
	}

	// Обработка завершения выбора временных промежутков
	if (data === "time_selection_done") {
		if (!state) {
			await bot.sendMessage(
				chatId,
				"Не удалось найти текущее состояние. Пожалуйста, начните заново."
			);
			return;
		}
		if (!photographer) {
			await bot.sendMessage(
				chatId,
				"Вы не зарегистрированы как фотограф."
			);
			return;
		}
		await timeSelectionDone(bot, chatId, query, photographer, state);
		return;
	}

	if (client) {
		await handleClientCallback(bot, chatId, query, data, client);
	} else if (photographer) {
		console.log(photographer, "HOHO");
		await handlePhotographerCallback(
			bot,
			chatId,
			query,
			data,
			photographer,
			state
		);
	} else {
		bot.sendMessage(
			chatId,
			"Пожалуйста, зарегистрируйтесь с помощью команды /start."
		);
	}
}

// Разделение логики для callback_query клиентов и фотографов
async function handleClientCallback(bot, chatId, query, data, client) {
	if (isDefaultCommand(data, clientDefaultCommands)) {
		return; // Прерываем выполнение, если нажата одна из стандартных кнопок
	}

	// Обработка различных callback-запросов клиентов
	if (data.startsWith("accept_reschedule_client;")) {
		await acceptRescheduleClient(bot, chatId, data, client);
	} else if (data.startsWith("decline_reschedule_client;")) {
		await declineRescheduleClient(bot, chatId, data, client);
	} else if (data.startsWith("client_reschedule;")) {
		// await initiateClientReschedule(bot, chatId, data, client);
	} else if (data.startsWith("select_time;")) {
		await selectTimeForBooking(bot, chatId, data, client);
	} else if (data.startsWith("select_date;")) {
		await selectDateForBooking(bot, chatId, data, client);
	} else if (data.startsWith("book:")) {
		await showAvailableDates(bot, chatId, data, client);
	} else if (data.startsWith("level:")) {
		await showPhotographersByLevel(bot, chatId, data);
	} else if (data.startsWith("page:")) {
		await handlePagination(bot, chatId, data);
	} else if (data.startsWith("confirm_booking;")) {
		await confirmBooking(bot, chatId, data, client);
	} else {
		bot.sendMessage(
			chatId,
			"Неизвестная команда. Пожалуйста, используйте доступные команды."
		);
	}
}

// Принять запрос на перебронирование от фотографа
async function acceptRescheduleClient(bot, chatId, data, client) {
	if (isDefaultCommand(data, clientDefaultCommands)) {
		return;
	}

	const bookingId = data.split(";")[1];
	const booking = await Booking.findById(bookingId);

	if (!booking || booking.clientId.toString() !== client._id.toString()) {
		bot.sendMessage(chatId, "Бронирование не найдено.");
		return;
	}

	// Обновляем бронирование с новой датой и временем
	booking.date = booking.reschedule.newDate;
	booking.timeSlot = booking.reschedule.newTimeSlot;
	booking.status = "approved";
	booking.reschedule.status = "accepted";
	await booking.save();

	// Уведомляем фотографа
	const photographer = await photographerController.getPhotographerById(
		booking.photographerId
	);
	bot.sendMessage(
		photographer.telegramId,
		`Ваш запрос на перебронирование на ${booking.date} в ${booking.timeSlot} принят клиентом.`
	);
	bot.sendMessage(chatId, "Вы приняли запрос на перебронирование.");
}

// Отклонить запрос на перебронирование от фотографа
async function declineRescheduleClient(bot, chatId, data, client) {
	if (isDefaultCommand(data, clientDefaultCommands)) {
		return;
	}

	const bookingId = data.split(";")[1];
	const booking = await Booking.findById(bookingId);

	if (!booking || booking.clientId.toString() !== client._id.toString()) {
		bot.sendMessage(chatId, "Бронирование не найдено.");
		return;
	}

	// Обновляем статус запроса на перебронирование
	booking.reschedule.status = "declined";
	await booking.save();

	// Уведомляем фотографа
	const photographer = await photographerController.getPhotographerById(
		booking.photographerId
	);
	bot.sendMessage(
		photographer.telegramId,
		`Ваш запрос на перебронирование на ${booking.reschedule.newDate} в ${booking.reschedule.newTimeSlot} отклонен клиентом.`
	);
	bot.sendMessage(chatId, "Вы отклонили запрос на перебронирование.");
}

// Обработка callback для фотографов
async function handlePhotographerCallback(
	bot,
	chatId,
	query,
	data,
	photographer,
	state
) {
	console.log(photographer, "SEVARA");
	if (isDefaultCommand(data, photographerDefaultCommands)) {
		return; // Прерываем выполнение, если нажата одна из стандартных кнопок
	}

	switch (true) {
		case data.startsWith("confirm_payment;"):
			await confirmPayment(bot, query, photographer);
			break;
		case data.startsWith("toggle_time;"):
			await toggleTime(bot, chatId, query, data, photographer, state);
			break;
		case data.startsWith("time_selection_done"):
			await timeSelectionDone(bot, chatId, query, photographer, state);
			break;
		case data.startsWith("reschedule_time_selection_done"):
			await rescheduleTimeSelectionDone(
				bot,
				chatId,
				query,
				photographer,
				state
			);
			break;
		case data.startsWith("reject_payment;"):
			await rejectPayment(bot, query, photographer);
			break;
		case data.startsWith("photographer_reschedule;"):
			await initiatePhotographerReschedule(bot, chatId, photographer);
			break;
		case data.startsWith("photographer_reschedule_date_"):
			await handlePhotographerReschedule(bot, query, photographer);
			break;
		case data.startsWith("accept_reschedule;"):
			await acceptReschedule(bot, query, photographer);
			break;
		case data.startsWith("decline_reschedule;"):
			await declineReschedule(bot, query, photographer);
			break;
		case data.startsWith("delete_photo_"):
			await deletePhoto(bot, query, photographer);
			break;
		case data.startsWith("edit_photo_"):
			await editPhotoInfo(bot, query, photographer);
			break;
		// Функции, вызываемые через photographerController, оставляем без изменений
		case data === "portfolio_add_photos":
			await photographerController.startPortfolioPhotoUpload(
				bot,
				chatId,
				query
			);
			break;
		case data === "portfolio_view":
			await photographerController.viewPortfolio(
				bot,
				chatId,
				photographer
			);
			break;
		case data === "portfolio_delete_photo":
			await photographerController.showPortfolioForDeletion(
				bot,
				chatId,
				photographer
			);
			break;
		case data === "portfolio_edit_info":
			await photographerController.showPortfolioForEditing(
				bot,
				chatId,
				photographer
			);
			break;
		default:
			bot.sendMessage(
				chatId,
				"Неизвестная команда. Пожалуйста, используйте доступные команды."
			);
			break;
	}
}

// Функция для запуска процесса перебронирования
async function initiatePhotographerReschedule(bot, chatId, photographerId) {
	// Получаем расписание фотографа
	const photographer = await Photographer.findById(photographerId);

	if (
		!photographer ||
		!photographer.schedule ||
		photographer.schedule.length === 0
	) {
		bot.sendMessage(chatId, "У фотографа нет доступных дат.");
		return;
	}

	// Формируем список доступных дат
	const availableDates = photographer.schedule.map((s) =>
		s.date.toISOString().slice(0, 10)
	);

	// Проверяем, есть ли доступные даты
	if (availableDates.length === 0) {
		bot.sendMessage(
			chatId,
			"У фотографа нет доступных дат для перебронирования."
		);
		return;
	}

	// Отправляем пользователю кнопки для выбора даты
	const dateButtons = availableDates.map((date) => [
		{ text: date, callback_data: `photographer_reschedule_date_${date}` },
	]);

	stateController.setState(chatId, "");
	bot.sendMessage(chatId, "Выберите новую дату для перебронирования:", {
		reply_markup: {
			inline_keyboard: dateButtons,
		},
	});
}

async function handlePhotographerReschedule(bot, query, photographer) {
	const chatId = query.message.chat.id;
	// Сохраняем выбранную дату
	const date = query.data.split("_")[3];

	let state = await stateController.getState(chatId);

	// Получаем доступные временные промежутки для этой даты
	const photographerSchedule = await photographer.schedule.find(
		(s) => s.date.toISOString().slice(0, 10) === date
	).availableSlots;

	if (!photographerSchedule || photographerSchedule.length === 0) {
		bot.sendMessage(
			chatId,
			"На эту дату нет доступных временных промежутков."
		);
		return;
	}
	console.log(photographerSchedule);

	// Обновляем состояние с новым selectedHours
	await stateController.setState(chatId, {
		state: "awaiting_rechedule_date",
		date: date,
	});

	bot.sendMessage(chatId, "Выберите время для перебронирования:", {
		reply_markup: {
			inline_keyboard:
				await photographerController.generateTimeSlotsKeyboard(
					"reschedule",
					date,
					[],
					photographerSchedule,
					chatId
				),
		},
	});

	// Если уже выбрана дата, то отправляем запрос на выбор времени
	if (state && state.state === "photographer_reschedule_time") {
		const { selectedDate } = state;

		const selectedTime = msg.text;

		// Логика для перебронирования на выбранную дату и время
		// Например, сохранение брони, обновление статуса и уведомление клиента

		bot.sendMessage(
			chatId,
			`Ваше бронирование перенесено на ${selectedDate} в ${selectedTime}.`
		);

		// Очистить состояние
		stateController.clearState(chatId);
	}
}

// Функция для обработки подтверждения оплаты
async function confirmPayment(bot, query, photographer) {
	try {
		const bookingId = query.data.split(";")[1]; // Извлекаем ID бронирования из данных кнопки
		console.log("Booking ID:", bookingId);

		// Находим бронирование по ID
		const booking = await Booking.findById(bookingId);
		if (!booking) {
			return bot.sendMessage(
				query.message.chat.id,
				"Бронирование не найдено."
			);
		}

		// Находим клиента по ID, который хранится в бронировании
		const client = await Client.findById(booking.clientId);
		if (!client) {
			return bot.sendMessage(query.message.chat.id, "Клиент не найден.");
		}

		// Обновляем статус бронирования
		booking.status = "confirmed"; // Обновите статус по вашему усмотрению
		await booking.save();

		// Уведомление клиенту о подтверждении с использованием telegramId
		await bot.sendMessage(
			client.telegramId, // Используем telegramId клиента
			`Ваше бронирование на ${booking.date} в ${booking.timeSlot} подтверждено!`
		);

		// Уведомление фотографу
		await bot.sendMessage(query.message.chat.id, "Вы подтвердили оплату.");
	} catch (error) {
		console.error("Ошибка при подтверждении оплаты:", error);
		await bot.sendMessage(
			query.message.chat.id,
			"Произошла ошибка при подтверждении оплаты. Пожалуйста, попробуйте позже."
		);
	}
}

//Отказ в подтверждении бронирования
async function rejectPayment(bot, query, photographer) {
	try {
		const bookingId = query.data.split(";")[1]; // Извлекаем ID бронирования из данных кнопки
		console.log("Booking ID:", bookingId);

		// Находим бронирование по ID
		const booking = await Booking.findById(bookingId);
		if (!booking) {
			return bot.sendMessage(
				query.message.chat.id,
				"Бронирование не найдено."
			);
		}

		// Находим клиента по ID, который хранится в бронировании
		const client = await Client.findById(booking.clientId);
		if (!client) {
			return bot.sendMessage(query.message.chat.id, "Клиент не найден.");
		}

		// Обновляем статус бронирования
		booking.status = "cancelled"; // Обновите статус по вашему усмотрению
		await booking.save();

		// Уведомление клиенту о подтверждении с использованием telegramId
		await bot.sendMessage(
			client.telegramId, // Используем telegramId клиента
			`Ваше бронирование на ${booking.date} в ${booking.timeSlot} отклонено!`
		);

		// Уведомление фотографу
		await bot.sendMessage(query.message.chat.id, "Вы отклонили оплату.");
	} catch (error) {
		console.error("Ошибка при подтверждении оплаты:", error);
		await bot.sendMessage(
			query.message.chat.id,
			"Произошла ошибка при подтверждении оплаты. Пожалуйста, попробуйте позже."
		);
	}
}

async function confirmBooking(bot, chatId, data, client) {
	// Извлекаем bookingId из строки
	const bookingId = data.split(";")[1];

	try {
		const booking = await Booking.findById(bookingId);
		const photographer = await Photographer.findById(
			booking.photographerId
		);
		console.log(booking);
		if (!booking) {
			bot.sendMessage(chatId, "Бронирование не найдено.");
			return;
		}

		// Изменяем статус бронирования на "awaiting_payment"
		booking.status = "awaiting_prepayment";
		await booking.save();

		// Информируем клиента о реквизитах
		bot.sendMessage(
			chatId,
			`Спасибо за подтверждение! Пожалуйста, внесите предоплату в размере 40% от общей суммы. Реквизиты для оплаты:\n\n${
				photographer.paymentDetails
					? photographer.paymentDetails
					: "Реквизиты на оплату не найдены, сообщите админу"
			}`
		);

		// Запрашиваем скриншот оплаты
		const state = { state: "awaiting_payment", bookingInfo: booking };
		stateController.setState(chatId, state);
	} catch (error) {
		console.error("Ошибка при подтверждении бронирования:", error);
		bot.sendMessage(
			chatId,
			"Произошла ошибка при подтверждении бронирования."
		);
	}
}
async function deletePhoto(bot, query, photographer) {
	if (isDefaultCommand(query.data, photographerDefaultCommands)) {
		return;
	}

	const chatId = query.message.chat.id;
	const photoIndex = parseInt(query.data.split("_")[2], 10);
	console.log(query.data);

	if (
		isNaN(photoIndex) ||
		photoIndex < 0 ||
		photoIndex >= photographer.portfolio.length
	) {
		await bot.sendMessage(
			chatId,
			"Некорректный индекс фотографии для удаления."
		);
		return;
	}

	const deletedPhoto = photographer.portfolio.splice(photoIndex, 1);

	// Сохранение изменений
	await photographer.save();

	await bot.sendMessage(
		chatId,
		`Фотография "${
			deletedPhoto[0].title || "Без названия"
		}" была успешно удалена.`
	);
}

// Обновление временных промежутков
async function toggleTime(bot, chatId, query, data, photographer, state) {
	if (isDefaultCommand(data, photographerDefaultCommands)) {
		return;
	}
	const availableSlots = state?.availableSlots;
	if (!state) {
		await bot.sendMessage(
			chatId,
			"Не удалось определить текущее состояние. Пожалуйста, начните процесс заново."
		);
		return;
	}

	// Инициализация selectedHours, если оно отсутствует
	if (!state.selectedHours) {
		state.selectedHours = [];
	}

	const hour = parseInt(data.split(";")[1]);
	const isReschedule = data.split(";")[2];
	console.log(isReschedule, "SISKA");
	const timeSlot = `${hour.toString().padStart(2, "0")}:00-${(hour + 1)
		.toString()
		.padStart(2, "0")}:00`;

	const existingBookings = await Booking.find({
		photographerId: photographer._id,
		date: state.date,
		timeSlot,
	});

	if (existingBookings.length > 0) {
		await bot.answerCallbackQuery(query.id, {
			text: "Этот временной промежуток уже забронирован.",
			show_alert: true,
		});
		return;
	}

	// Проверка на выбор соседних слотов
	if (state.selectedHours.length > 0 && isReschedule == 1) {
		const minSelected = Math.min(...state.selectedHours);
		const maxSelected = Math.max(...state.selectedHours);

		if (hour !== minSelected - 1 && hour !== maxSelected + 1) {
			await bot.answerCallbackQuery(query.id, {
				text: "Вы можете выбирать только соседние промежутки времени.",
				show_alert: true,
			});
			return;
		}
	}

	if (state.selectedHours.includes(hour)) {
		state.selectedHours = state.selectedHours.filter((h) => h !== hour);
	} else {
		state.selectedHours.push(hour);
	}

	const keyboard =
		isReschedule == 1
			? await photographerController.generateTimeSlotsKeyboard(
					"reschedule",
					state.date,
					state.selectedHours,
					availableSlots,
					chatId
			  )
			: await photographerController.generateTimeSlotsKeyboard(
					"",
					state.date,
					state.selectedHours,
					[],
					""
			  );

	await bot.editMessageReplyMarkup(
		{
			inline_keyboard: keyboard,
		},
		{
			chat_id: chatId,
			message_id: query.message.message_id,
		}
	);

	await bot.answerCallbackQuery(query.id);
}

async function rescheduleTimeSelectionDone(
	bot,
	chatId,
	query,
	photographer,
	state
) {
	if (!state.selectedHours || state.selectedHours.length === 0) {
		await bot.sendMessage(
			chatId,
			"Вы не выбрали ни одного временного промежутка."
		);
		return;
	}

	const date = state.date;
	const selectedHours = state.selectedHours.sort((a, b) => a - b);

	// Создаем диапазон времени для нового бронирования
	const startHour = selectedHours[0];
	const endHour = selectedHours[selectedHours.length - 1] + 1;
	const newTimeRange = `${startHour.toString().padStart(2, "0")}:00-${endHour
		.toString()
		.padStart(2, "0")}:00`;

	try {
		// Ищем существующее бронирование для этого фотографа и даты
		const existingBooking = await Booking.findOne({
			photographerId: photographer._id,
			date: date, // Преобразуем дату в правильный формат// Учитываем только подтвержденные бронирования
		});

		console.log(existingBooking, "SHLUXA");

		if (existingBooking) {
			// Обновляем временной интервал бронирования
			existingBooking.timeSlot = newTimeRange;
			await existingBooking.save();

			await bot.sendMessage(
				chatId,
				`Ваше время бронирования было успешно изменено на: ${newTimeRange}`
			);
		} else {
			await bot.sendMessage(
				chatId,
				"Не удалось найти существующее бронирование для изменения."
			);
		}
	} catch (error) {
		console.error("Error during rescheduling:", error);
		await bot.sendMessage(
			chatId,
			"Произошла ошибка при изменении времени бронирования."
		);
	}
}

// Обработка завершения выбора временных промежутков
async function timeSelectionDone(bot, chatId, query, photographer, state) {
	if (!state.selectedHours || state.selectedHours.length === 0) {
		await bot.sendMessage(
			chatId,
			"Вы не выбрали ни одного временного промежутка."
		);
		return;
	}

	const date = state.date;
	console.log(state);
	const selectedHours = state.selectedHours;

	// Преобразуем выбранные часы в нужный формат времени
	const newAvailableSlots = selectedHours.map((hour) => {
		return `${hour.toString().padStart(2, "0")}:00-${(hour + 1)
			.toString()
			.padStart(2, "0")}:00`;
	});

	// Ищем существующее расписание на выбранную дату
	let scheduleForDate = photographer.schedule.find(
		(s) =>
			s.date.toISOString().slice(0, 10) ===
			new Date(date).toISOString().slice(0, 10)
	);

	if (scheduleForDate) {
		// Обновляем доступные промежутки для существующего расписания
		console.log("Updating existing scheduleForDate");
		scheduleForDate.availableSlots = newAvailableSlots;
	} else {
		// Создаем новое расписание для указанной даты
		console.log("Creating new scheduleForDate");
		scheduleForDate = {
			date: new Date(date),
			availableSlots: newAvailableSlots,
		};
		photographer.schedule.push(scheduleForDate);
	}

	// Логируем обновленное расписание
	console.log("Updated scheduleForDate:", scheduleForDate);

	// Явно указываем, что schedule было изменено
	photographer.markModified("schedule");

	// Сохраняем изменения
	try {
		await photographer.save();
		console.log("Photographer saved successfully");
	} catch (error) {
		console.error("Error saving photographer:", error);
	}

	// Очищаем состояние
	await stateController.clearState(chatId);

	// Проверяем результат после сохранения
	const updatedPhotographer = await Photographer.findById(photographer._id);
	console.log("Photographer after save:", updatedPhotographer.schedule);

	await bot.sendMessage(
		chatId,
		`Вы успешно установили доступные временные промежутки на ${date}.`
	);
}

module.exports = { handleCallbackQuery };
