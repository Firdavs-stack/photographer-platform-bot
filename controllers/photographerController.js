// controllers/photographerController.js

const Photographer = require("../models/Photographer");
const Booking = require("../models/booking");
const Client = require("../models/client");
const stateController = require("./stateController");
const axios = require("axios");
const fs = require("fs");

const sourceDir = path.resolve(__dirname, "../../..");

// Определяем команды по умолчанию для фотографов
const photographerDefaultCommands = [
	"📸 Добавить портфолио",
	"📅 Бронирования",
	"⚙️ Настройки",
	"🕒 Выбрать временные промежутки",
	"💳 Реквизиты",
	"🎟 Ссылка",
];

// Функция для проверки, является ли команда командой по умолчанию
function isDefaultCommand(data, defaultCommands) {
	return defaultCommands.includes(data);
}

async function getCurrentBotState() {
	return await stateController.getState();
}

// Функция для получения фотографа по Telegram ID
async function getPhotographerByTelegramId(telegramId) {
	return await Photographer.findOne({ telegramId: telegramId.toString() });
}

async function showPortfolioForEditing(bot, chatId, photographer) {
	if (photographer.portfolio.length === 0) {
		await bot.sendMessage(chatId, "Ваше портфолио пусто.");
		return;
	}

	await stateController.setState(chatId, {
		state: "awaiting_portfolio_info_for_editing",
	});

	const portfolioMessages = photographer.portfolio.map((photo, index) => {
		return {
			type: "photo",
			media: photo.imagePath,
			caption: `Фото #${index + 1}\nНазвание: ${
				photo.title
			}\nКатегория: ${photo.category}`,
			parse_mode: "Markdown",
		};
	});

	await bot.sendMediaGroup(chatId, portfolioMessages);

	console.log(state);
	await bot.sendMessage(
		chatId,
		"Чтобы изменить данные о фото, введите номер фото и новые данные в формате: 'номер; новое название; новая категория'",
		{
			reply_markup: {
				force_reply: true,
			},
		}
	);
}

async function showPortfolioForDeletion(bot, chatId, photographer) {
	if (!photographer.portfolio || photographer.portfolio.length === 0) {
		await bot.sendMessage(chatId, "Ваше портфолио пусто.");
		return;
	}

	const keyboard = photographer.portfolio.map((photo, index) => [
		{
			text: `Удалить: ${photo.title || "Без названия"}`,
			callback_data: `delete_photo_${index}`,
		},
	]);

	await bot.sendMessage(chatId, "Выберите фотографию для удаления:", {
		reply_markup: {
			inline_keyboard: keyboard,
		},
	});
}

async function viewPortfolio(bot, chatId, photographer) {
	if (photographer.portfolio.length === 0) {
		bot.sendMessage(
			chatId,
			"Ваше портфолио пусто. Добавьте фотографии, чтобы заполнить его."
		);
	} else {
		for (const photo of photographer.portfolio) {
			await bot.sendPhoto(chatId, photo.imagePath, {
				caption: `Название: ${photo.title}\nКатегория: ${photo.category}`,
			});
		}
	}
}

// Функция для обработки сообщений фотографа
async function handlePhotographerMessage(bot, msg, photographer) {
	const chatId = msg.chat.id;
	const text = msg.text.trim();
	let state = await stateController.getState(chatId);
	console.log(chatId);
	console.log(text, state, "MAMAMAM");
	if (isDefaultCommand(text, photographerDefaultCommands) && state) {
		await stateController.clearState(chatId);
		state = null; // Обновляем переменную state после очистки
		// Продолжаем выполнение для обработки команды по умолчанию
	}

	// Обработка различных состояний фотографа
	if (state) {
		switch (state.state) {
			case "accept_reschedule_photographer":
				booking.status = "rescheduled";
				booking.reschedule.status = "accepted";
				await booking.save();

				bot.sendMessage(
					chatId,
					`Запрос на перебронирование от клиента принят. Бронирование на ${booking.reschedule.newDate} в ${booking.reschedule.newTimeSlot} было подтверждено.`
				);

				const client = await Client.findById(booking.clientId);
				bot.sendMessage(
					client.telegramId,
					`Ваше перебронирование на ${booking.reschedule.newDate} в ${booking.reschedule.newTimeSlot} было принято фотографом.`
				);

				break;

			case "decline_reschedule_photographer":
				booking.status = "declined";
				booking.reschedule.status = "declined";
				await booking.save();

				bot.sendMessage(
					chatId,
					`Запрос на перебронирование от клиента отклонен. Бронирование остается в прежнем времени.`
				);

				const clientDecline = await Client.findById(booking.clientId);
				bot.sendMessage(
					clientDecline.telegramId,
					`Ваше перебронирование было отклонено фотографом.`
				);
				break;
			case "awaiting_portfolio_photos":
				await chooseNamingPortfolioPhotos(bot, chatId, text, state);
				break;

			case "awaiting_profile_update":
				// Обработка обновления личной информации
				const [firstName, lastName, phone] = text
					.split(";")
					.map((entry) => entry.trim());

				console.log(firstName, lastName, phone);

				if (!firstName || !lastName || !/^[+]\d{9,15}$/.test(phone)) {
					bot.sendMessage(
						chatId,
						"Пожалуйста, введите данные в правильном формате: 'Имя; Фамилия; Телефон' (в международном формате: +123456789)."
					);
					return;
				}
				console.log(phone);
				photographer.firstName = firstName;
				photographer.lastName = lastName;
				photographer.phoneNumber = phone;
				await photographer.save();

				await stateController.clearState(chatId);

				bot.sendMessage(chatId, "Ваши данные успешно обновлены.");
				break;
			case "awaiting_portfolio_info_for_editing":
				const [numb, newNaming, newCategory] = text
					.split(";")
					.map((entry) => entry.trim);
				bot.sendMessage(
					chatId,
					`Вы ввели ${(numb, newNaming, newCategory)}`
				);
				break;
			case "awaiting_payment_details":
				console.log(text);
				photographer.paymentDetails = text;
				await photographer.save();

				await stateController.clearState(chatId);

				bot.sendMessage(
					chatId,
					"Ваши реквизиты на оплату успешно обновлены."
				);
				break;
			case "awaiting_date":
				await checkTheBookingDate(bot, text, chatId, photographer);
				break;

			default:
				bot.sendMessage(
					chatId,
					"Пожалуйста, используйте список зарегистрированных команд."
				);
				break;
		}
		return;
	}

	// Обработка текстовых команд фотографа
	switch (text) {
		case "⚙️ Настройки":
			bot.sendMessage(
				chatId,
				`Ваши данные:\nИмя: ${photographer.firstName}\nФамилия: ${photographer.lastName}\nТелефон: ${photographer.phoneNumber}\n\nДля обновления отправьте новые данные в формате 'Имя; Фамилия; Телефон'.`
			);
			await stateController.setState(chatId, {
				state: "awaiting_profile_update",
			});
			break;
		case "🎟 Ссылка":
			await sendInvitationLink(bot, chatId, photographer._id);
			break;
		case "💳 Реквизиты":
			if (photographer.paymentDetails) {
				bot.sendMessage(
					chatId,
					`Ваши текущие реквизиты:\n${photographer.paymentDetails}\n\nДля обновления отправьте новые реквизиты.`
				);
			} else {
				bot.sendMessage(
					chatId,
					"У вас нет сохраненных реквизитов. Пожалуйста, отправьте свои реквизиты."
				);
			}
			await stateController.setState(chatId, {
				state: "awaiting_payment_details",
			});
			break;

		case "📸 Добавить портфолио":
			console.log(text);
			showPortfolioMenu(bot, chatId);
			break;

		case "📅 Бронирования":
			await showPhotographerBookings(bot, chatId, photographer);
			break;

		case "🕒 Выбрать временные промежутки":
			await choosePhotographerTimeSlots(bot, chatId);
			break;

		default:
			bot.sendMessage(
				chatId,
				"Пожалуйста, используйте доступные команды."
			);
			break;
	}
}

async function showPhotographerBookings(bot, chatId, photographer) {
	const bookings = await Booking.find({ photographerId: photographer._id });

	if (bookings.length === 0) {
		bot.sendMessage(chatId, "У вас нет бронирований.");
	} else {
		for (const booking of bookings) {
			let message = `Клиент: ${booking.clientName || "Неизвестно"}
Дата: ${new Date(booking.date).toISOString().slice(0, 10)}
Время: ${booking.timeSlot}
Статус: ${booking.status}
`;

			const buttons = [];

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
						callback_data: `photographer_reschedule;${booking._id}`,
					},
				]);
			}

			if (
				booking.reschedule &&
				booking.reschedule.requestedBy === "client" &&
				booking.reschedule.status === "pending"
			) {
				message += `Запрос на перебронирование от клиента:
Новая дата: ${new Date(booking.reschedule.newDate).toISOString().slice(0, 10)}
Новое время: ${booking.reschedule.newTimeSlot}
`;

				buttons.push([
					{
						text: "Принять",
						callback_data: `accept_reschedule;${booking._id}`,
					},
					{
						text: "Отклонить",
						callback_data: `decline_reschedule;${booking._id}`,
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

async function checkTheBookingDate(bot, text, chatId, photographer) {
	if (isDefaultCommand(text, photographerDefaultCommands)) {
		return;
	}

	const dateText =
		text.toLowerCase() === "сегодня"
			? new Date().toISOString().slice(0, 10)
			: text;

	// Проверяем формат даты
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
		await bot.sendMessage(
			chatId,
			'Пожалуйста, введите дату в формате YYYY-MM-DD или напишите "сегодня".'
		);
		return;
	}

	// Проверяем расписание фотографа на указанную дату
	const existingSchedule = photographer.schedule.find(
		(s) => s.date.toISOString().slice(0, 10) === dateText
	);
	const selectedSlots = existingSchedule
		? existingSchedule.availableSlots.map((slot) =>
				parseInt(slot.split(":")[0])
		  )
		: [];
	console.log("START");
	// Генерируем клавиатуру с временными промежутками
	const keyboard = await generateTimeSlotsKeyboard(
		"",
		dateText,
		selectedSlots,
		[],
		""
	);

	// Сохраняем состояние пользователя
	await stateController.setState(chatId, {
		state: "selecting_time_slots",
		date: dateText,
		selectedHours: selectedSlots,
	});

	// Отправляем сообщение с клавиатурой
	await bot.sendMessage(
		chatId,
		`Выберите доступные временные промежутки для даты ${dateText}:`,
		{
			reply_markup: { inline_keyboard: keyboard },
		}
	);
}

async function choosePhotographerTimeSlots(bot, chatId) {
	// Проверяем, является ли пользователь фотографом
	const photographer = await Photographer.findOne({
		telegramId: chatId.toString(),
	});

	if (!photographer) {
		bot.sendMessage(chatId, "Вы не зарегистрированы как фотограф.");
		return;
	}

	// Устанавливаем начальное состояние для выбора времени
	await stateController.setState(chatId, {
		state: "awaiting_date",
		date: null,
		selectedHours: [], // Инициализация пустого массива для выбранных промежутков
	});

	bot.sendMessage(
		chatId,
		'Введите дату в формате YYYY-MM-DD или напишите "сегодня":'
	);
}

async function startPortfolioPhotoUpload(bot, chatId, query) {
	// Здесь не добавляем проверку, так как функция вызывается через photographerController
	bot.sendMessage(
		chatId,
		"Пожалуйста, отправьте одну или несколько фотографий."
	);
	await stateController.setState(chatId, {
		state: "awaiting_portfolio_photos",
		tempPhotos: [],
	});
}

async function chooseNamingPortfolioPhotos(bot, chatId, text, state) {
	if (isDefaultCommand(text, photographerDefaultCommands)) {
		return;
	}

	console.log(state);
	const tempPhotos = state.tempPhotos || [];
	const photographer = await Photographer.findOne({
		telegramId: chatId.toString(),
	});

	console.log(tempPhotos, photographer);

	if (text !== "/done") {
		// Разделяем текст на пары "Название; Категория" по разделителю "|"
		const entries = text.split("|").map((entry) => entry.trim());
		if (entries.length !== tempPhotos.length) {
			bot.sendMessage(
				chatId,
				"Количество названий и категорий не соответствует количеству фотографий. Пожалуйста, попробуйте снова."
			);
			return;
		}

		for (let i = 0; i < entries.length; i++) {
			const [title, category] = entries[i]
				.split(";")
				.map((s) => s.trim());
			tempPhotos[i].title = title || "";
			tempPhotos[i].category = category || "";
		}

		await stateController.setState(chatId, { ...state, tempPhotos });

		bot.sendMessage(
			chatId,
			"Названия и категории сохранены. Вы можете продолжить отправлять фотографии или ввести /done, чтобы завершить."
		);
	} else {
		if (tempPhotos.length === 0) {
			bot.sendMessage(chatId, "Вы не отправили ни одной фотографии.");
			return;
		}
		console.log(tempPhotos);
		await savePhotosToPortfolio(bot, photographer, tempPhotos, chatId);

		await stateController.clearState(chatId);
		bot.sendMessage(chatId, "Картинки сохранены, продолжайте брать заказы");
	}
}

// Функция для сохранения фотографий в портфолио
async function savePhotosToPortfolio(bot, photographer, tempPhotos, chatId) {
	try {
		for (const photo of tempPhotos) {
			const file = await bot.getFile(photo.file_id);
			const filePath = file.file_path;
			console.log(file, filePath);
			const downloadUrl = `https://api.telegram.org/file/bot${bot.token}/${filePath}`;

			const axiosResponse = await axios.get(downloadUrl, {
				responseType: "stream",
			});
			const filename = `${path.resolve(
				sourceDir,
				"two2one.uz/images/portfolio"
			)}${Date.now()}_${photo.file_id}.png`;
			console.log("SIIIU", file);
			const writer = fs.createWriteStream(filename);
			axiosResponse.data.pipe(writer);

			await new Promise((resolve, reject) => {
				writer.on("finish", resolve);
				writer.on("error", reject);
			});

			photographer.portfolio.push({
				imagePath: filename,
				title: photo.title,
				category: photo.category,
			});
		}

		await photographer.save();
	} catch (error) {
		console.error("Ошибка при сохранении фотографий в портфолио:", error);
		bot.sendMessage(
			chatId,
			"Произошла ошибка при сохранении фотографий. Пожалуйста, попробуйте позже."
		);
	}
}

// Функция для отображения меню портфолио
function showPortfolioMenu(bot, chatId) {
	bot.sendMessage(chatId, "Выберите действие с портфолио:", {
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: "Добавить фотографии",
						callback_data: "portfolio_add_photos",
					},
				],
				[
					{
						text: "Просмотреть портфолио",
						callback_data: "portfolio_view",
					},
				],
				[
					{
						text: "Удалить фотографию",
						callback_data: "portfolio_delete_photo",
					},
				],
				[
					{
						text: "Изменить информацию о фотографии",
						callback_data: "portfolio_edit_info",
					},
				],
			],
		},
	});
}

async function generateInvitationLink(photographerId) {
	const link = `https://t.me/two2onestudio_bot?start=invite_${photographerId}`;

	// Сохраните токен в базе, если хотите сделать ссылки одноразовыми или отслеживать их использование
	return link;
}

async function sendInvitationLink(bot, chatId, photographerId) {
	const link = await generateInvitationLink(photographerId);
	await bot.sendMessage(
		chatId,
		`Вот ваша уникальная ссылка для приглашения клиентов: ${link}`
	);
}

// Функция для генерации клавиатуры с временными промежутками
async function generateTimeSlotsKeyboard(
	type = "default",
	dateText,
	selectedHours = [],
	availableDates = [],
	chatId = ""
) {
	console.log(type, "END");
	const timeSlots = [];
	const isReschedule = type == "reschedule" ? 1 : 0;
	if (isReschedule == 1) {
		stateController.updateState(chatId, { availableSlots: availableDates });
		console.log(availableDates, "GANDON");
		availableDates.forEach((timeSlot) => {
			const slotText = String(timeSlot);
			const hour = parseInt(slotText.split("-")[0].split(":")[0]);
			console.log(selectedHours, "siu");
			const isSelected = selectedHours.includes(hour);
			timeSlots.push({
				text: isSelected ? `✅ ${timeSlot}` : timeSlot,
				callback_data: `toggle_time;${hour};${isReschedule}`,
			});
		});
	} else {
		console.log("ВСЕ ЧЕТКО");
		// Генерируем слоты времени с кнопками
		for (let hour = 0; hour < 24; hour++) {
			const timeSlot = `${hour.toString().padStart(2, "0")}:00-${(
				hour + 1
			)
				.toString()
				.padStart(2, "0")}:00`;
			console.log(selectedHours, "siu");
			const isSelected = selectedHours.includes(hour);
			timeSlots.push({
				text: isSelected ? `✅ ${timeSlot}` : timeSlot,
				callback_data: `toggle_time;${hour};${isReschedule}`,
			});
		}
	}

	// Разбиваем кнопки на строки по 3
	const keyboard = [];
	for (let i = 0; i < timeSlots.length; i += 3) {
		keyboard.push(timeSlots.slice(i, i + 3));
	}
	// Добавляем кнопку "Готово"
	keyboard.push([
		{
			text: "Готово",
			callback_data:
				type == "reschedule"
					? `reschedule_time_selection_done_${dateText}`
					: `time_selection_done_${dateText}`,
		},
	]);

	return keyboard;
}
// Экспортируем необходимые функции
module.exports = {
	handlePhotographerMessage,
	showPortfolioMenu,
	savePhotosToPortfolio,
	getPhotographerByTelegramId,
	generateTimeSlotsKeyboard,
	chooseNamingPortfolioPhotos,
	getCurrentBotState,
	startPortfolioPhotoUpload,
	showPhotographerBookings,
	viewPortfolio,
	showPortfolioForDeletion,
	showPortfolioForEditing,
	isDefaultCommand,
};
