const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const clientController = require("./controllers/clientController");
const photographerController = require("./controllers/photographerController");
const callbackHandler = require("./controllers/callbackHandler");
const stateController = require("./controllers/stateController");
const Client = require("./models/client");
const Photographer = require("./models/Photographer");
const Booking = require("./models/booking");

// Инициализация бота
const bot = new TelegramBot("7647751844:AAGSToi5DCbuRGAA156G52obCl3FLHBn5j4", {
	polling: true,
});

// Подключение к базе данных
mongoose.connect(
	"mongodb+srv://firdavsusmanov418:gPPbpsmhIDE5sf9b@cluster0.owmnn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
	{
		useNewUrlParser: true,
		useUnifiedTopology: true,
	}
);

// Регистрация обработчиков для клиентов и фотографов
bot.on("message", async (msg) => {
	const chatId = msg.chat.id;
	const client = await clientController.getClientByTelegramId(chatId);
	const state = await stateController.getState(chatId);
	const photographer =
		await photographerController.getPhotographerByTelegramId(chatId);

	if (
		msg.photo ||
		msg.document ||
		msg.video ||
		msg.audio ||
		(msg.text && msg.text.startsWith("/"))
	) {
		return;
	}

	if (client) {
		if (msg.text === "🔍 Поиск фотографов") {
			// Отправляем inline_keyboard с Web App кнопкой для поиска фотографов
			bot.sendMessage(
				chatId,
				"Нажмите кнопку ниже, чтобы открыть поиск фотографов:",
				{
					reply_markup: {
						inline_keyboard: [
							[
								{
									text: "🔍 Открыть поиск фотографов",
									web_app: {
										url: "https://two2one.uz",
									},
								},
							],
						],
					},
				}
			);
		} else {
			clientController.handleClientMessage(bot, msg, client);
		}
	} else if (photographer) {
		photographerController.handlePhotographerMessage(
			bot,
			msg,
			photographer
		);
	} else {
		if (state && state.state === "registering") {
			switch (state.step) {
				case "get_name":
					// Запрашиваем фамилию после имени
					await stateController.setState(chatId, {
						state: "registering",
						step: "get_phone",
						name: msg.text.trim(),
						referringPhotographerId: state.referringPhotographerId, // Сохраняем фотографа
					});
					bot.sendMessage(
						chatId,
						"Теперь, введите ваш номер телефона (в международном формате: +123456789):"
					);
					break;
				case "get_phone":
					// Заполняем модель и сохраняем данные
					const phone = msg.text.trim();
					if (!/^[+]\d{9,15}$/.test(phone)) {
						bot.sendMessage(
							chatId,
							"Номер телефона должен быть в международном формате! Попробуйте снова."
						);
						return;
					}
					const newClient = new Client({
						telegramId: chatId.toString(),
						name: state.name,
						phone: phone,
						telegramUsername: msg.from.username,
						referringPhotographerId: state.referringPhotographerId, // Привязываем фотографа
					});
					await newClient.save();

					// Очищаем состояние
					await stateController.clearState(chatId);

					bot.sendMessage(
						chatId,
						`Вы успешно зарегистрированы. Добро пожаловать, ${state.name}!`,
						{
							reply_markup: {
								keyboard: [
									["🔍 Поиск фотографов"],
									["👤 Мой аккаунт", "📅 Мои бронирования"],
									["⚙️ Настройки", "💳 Реквизиты"],
								],
								one_time_keyboard: false,
								resize_keyboard: true,
							},
						}
					);
					break;
				default:
					bot.sendMessage(
						chatId,
						"Пожалуйста, введите правильную команду."
					);
					break;
			}
		} else {
			await stateController.setState(chatId, {
				state: "registering",
				step: "get_name",
			});
			bot.sendMessage(
				chatId,
				"Привет! Давайте начнем с того, что вы представитесь. Введите ваше имя:"
			);
		}
	}
});

// Обработка фото от клиента
bot.on("photo", async (msg) => {
	const chatId = msg.chat.id;
	const state = await stateController.getState(chatId);
	const client = await Client.findOne({ telegramId: chatId.toString() });
	const photographer = await Photographer.findOne({
		telegramId: chatId.toString(),
	});

	// Проверка, является ли пользователь клиентом
	if (client) {
		// Обработка скриншота оплаты для клиентов
		if (state && state.state === "awaiting_payment") {
			const bookingId = state.bookingInfo._id; // Получаем ID бронирования из состояния
			const photoId = msg.photo[msg.photo.length - 1].file_id; // ID фотографии

			// Обновляем существующее бронирование, добавляя скриншот
			const booking = await Booking.findById(bookingId);
			if (!booking) {
				return bot.sendMessage(
					chatId,
					"Бронирование не найдено. Пожалуйста, попробуйте еще раз."
				);
			}

			// Сохраняем ID скриншота в бронировании
			booking.paymentScreenshot = photoId;
			booking.status = "awaiting_confirmation"; // Обновляем статус бронирования
			await booking.save(); // Сохраняем изменения в базе данных

			// Уведомление клиенту
			bot.sendMessage(
				chatId,
				"Спасибо! Ваш скриншот оплаты получен. Ожидайте подтверждения от фотографа."
			);

			// Получаем данные фотографа
			const photographerData = await Photographer.findById(
				booking.photographerId
			);
			if (photographerData) {
				await bot.sendPhoto(photographerData.telegramId, photoId, {
					caption: `Новое бронирование от клиента *${client.name}* на *${booking.date}* в *${booking.timeSlot}*. Пожалуйста, подтвердите или отклоните оплату.`,
					parse_mode: "Markdown",
					reply_markup: {
						inline_keyboard: [
							[
								{
									text: "✅ Подтвердить оплату",
									callback_data: `confirm_payment;${booking._id}`,
								},
								{
									text: "❌ Отклонить оплату",
									callback_data: `reject_payment;${booking._id}`,
								},
							],
						],
					},
				});
			}

			// Очищаем состояние клиента
			await stateController.clearState(chatId);
		} else {
			// Если состояние не соответствует ожиданиям
			bot.sendMessage(
				chatId,
				"Пожалуйста, выберите дату и время для бронирования сначала."
			);
		}
	} else if (photographer) {
		bot.sendMessage(chatId, "SOOOu");
		if (state && state.state === "awaiting_portfolio_photos") {
			const tempPhotos = state.tempPhotos || [];
			const photoId = msg.photo[msg.photo.length - 1].file_id;
			tempPhotos.push({ file_id: photoId, title: "", category: "" });

			// Сохраняем временные фотографии в состоянии
			await stateController.setState(chatId, { ...state, tempPhotos });
			await bot.sendMessage(
				chatId,
				"Фотография добавлена. Теперь отправьте текстовые описания для всех фотографий в формате: `Название; Категория | Название; Категория`.\nИли введите /done, если хотите завершить добавление фотографий без описаний.",
				{ parse_mode: "Markdown" }
			);
		} else if (state && state.state === "cancellingBooking") {
			bot.sendMessage(chatId, "SOOOu");
			const bookingId = state.bookingInfo._id; // Получаем ID бронирования из состояния
			const photoId = msg.photo[msg.photo.length - 1].file_id; // ID фотографии

			// Обновляем существующее бронирование, добавляя скриншот
			const booking = await Booking.findById(bookingId);
			if (!booking) {
				return bot.sendMessage(
					chatId,
					"Бронирование не найдено. Пожалуйста, попробуйте еще раз."
				);
			}

			// Сохраняем ID скриншота в бронировании
			booking.canceledScreenshot = photoId;
			booking.status = "awaiting_cancelling_confirmation"; // Обновляем статус бронирования
			await booking.save(); // Сохраняем изменения в базе данных

			// Уведомление клиенту
			bot.sendMessage(
				chatId,
				"Спасибо! Ваш скриншот оплаты получен. Ожидайте подтверждения от клиента."
			);
			const clientData = await Photographer.findById(
				booking.photographerId
			);
			if (clientData) {
				await bot.sendPhoto(clientData.telegramId, photoId, {
					caption: `Новое запрос отмены от фотографа *${photographer.firstName}. Пожалуйста, подтвердите отмену бронирования или перебронируйте.`,
					parse_mode: "Markdown",
					reply_markup: {
						inline_keyboard: [
							[
								{
									text: "✅ Подтвердить отмену",
									callback_data: `confirm_cancelling;${booking._id}`,
								},
								{
									text: "Перебронировать",
									callback_data: `client_reschedule;${booking._id}`,
								},
							],
						],
					},
				});
			}
		} else {
			// Если состояние не соответствует ожиданиям
			bot.sendMessage(
				chatId,
				"Пожалуйста, используйте команду для добавления фотографий в портфолио."
			);
		}
	} else {
		// Если пользователь не зарегистрирован
		bot.sendMessage(
			chatId,
			"Пожалуйста, зарегистрируйтесь, используя команду /start."
		);
	}
});

// Обработка команды /start с возможностью пригласительных ссылок
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
	const chatId = msg.chat.id;
	const inviteData = match[1]; // Получаем ссылку, если она есть

	// Если ссылка с photographerId
	if (inviteData) {
		const [type, photographerId] = inviteData.split("_");

		// Проверяем, что это именно ссылка с фотографом
		if (type === "invite" && photographerId) {
			const photographer = await Photographer.findById(photographerId);
			if (photographer) {
				// Привязываем клиента к фотографу
				const client = await Client.findOne({
					telegramId: chatId.toString(),
				});

				if (client) {
					client.referringPhotographerId = photographer._id;
					await client.save();
					bot.sendMessage(
						chatId,
						`Вы привязаны к фотографу ${photographer.firstName} ${photographer.lastName}.`
					);
				} else {
					// Если клиент еще не зарегистрирован, начинаем процесс регистрации
					await stateController.setState(chatId, {
						state: "registering",
						step: "get_name",
						referringPhotographerId: photographer._id, // Запоминаем фотографа
					});
					bot.sendMessage(
						chatId,
						"Привет! Давайте начнем с того, что вы представитесь. Введите ваше имя:"
					);
				}
			} else {
				bot.sendMessage(chatId, "Фотограф с таким ID не найден.");
			}
		}
		return; // Если ссылка обрабатывается, завершаем выполнение этой части
	}

	// Если клиент уже существует
	const client = await Client.findOne({ telegramId: chatId.toString() });
	const photographer = await Photographer.findOne({
		telegramId: chatId.toString(),
	});

	if (client) {
		bot.sendMessage(chatId, `Привет, ${client.name}! Чем могу помочь?`, {
			reply_markup: {
				keyboard: [
					["🔍 Поиск фотографов"],
					["👤 Мой аккаунт", "📅 Мои бронирования"],
					["⚙️ Настройки", "💳 Реквизиты"],
				],
				one_time_keyboard: false,
				resize_keyboard: true,
			},
		});
	} else if (photographer) {
		bot.sendMessage(
			chatId,
			`Привет, ${photographer.firstName}! Чем могу помочь?`,
			{
				reply_markup: {
					keyboard: [
						[{ text: "📸 Добавить портфолио" }],
						[{ text: "📅 Бронирования" }, { text: "⚙️ Настройки" }],
						[{ text: "🕒 Выбрать временные промежутки" }],
						[{ text: "💳 Реквизиты" }, { text: "🎟 Ссылка" }],
						[{ text: "🔍 Поиск клиентов" }], // Добавлена кнопка для поиска клиентов
					],
					resize_keyboard: true,
					one_time_keyboard: false,
				},
			}
		);
	} else {
		// Если еще не зарегистрирован, начинаем регистрацию
		await stateController.setState(chatId, {
			state: "registering",
			step: "get_name",
		});
		bot.sendMessage(
			chatId,
			"Привет! Давайте начнем с того, что вы представитесь. Введите ваше имя:"
		);
	}
});
// Обработка команды /done
bot.onText(/\/done/, async (msg) => {
	const chatId = msg.chat.id;
	const state = await stateController.getState(chatId);

	if (state && state.state === "awaiting_portfolio_photos") {
		await photographerController.chooseNamingPortfolioPhotos(
			bot,
			chatId,
			"/done",
			state
		);
	} else {
		bot.sendMessage(
			chatId,
			"Вы не находитесь в процессе добавления фотографий."
		);
	}
});

// Обработка callback_query
bot.on("callback_query", (query) => {
	callbackHandler.handleCallbackQuery(bot, query);
});

module.exports = bot;
