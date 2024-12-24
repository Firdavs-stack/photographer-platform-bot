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
	const photoId = msg.photo[msg.photo.length - 1].file_id;

	// Определяем, клиент или фотограф отправил фото
	const client = await Client.findOne({ telegramId: chatId.toString() });
	const photographer = await Photographer.findOne({
		telegramId: chatId.toString(),
	});

	try {
		if (client) {
			await handleClientPhoto(msg, state, client, photoId);
		} else if (photographer) {
			await handlePhotographerPhoto(msg, state, photographer, photoId);
		} else {
			// Пользователь не зарегистрирован
			bot.sendMessage(
				chatId,
				"Пожалуйста, зарегистрируйтесь, используя команду /start."
			);
		}
	} catch (error) {
		console.error("Error handling photo:", error);
		bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
	}
});

// Обработка фото от клиента
async function handleClientPhoto(msg, state, client, photoId) {
	const chatId = msg.chat.id;

	if (!state) {
		return bot.sendMessage(
			chatId,
			"Пожалуйста, выберите дату и время для бронирования сначала."
		);
	}

	switch (state.state) {
		case "awaiting_payment":
			await processPaymentScreenshot(state, photoId, chatId, client);
			break;
		case "cancellingBooking":
			await processCancellationScreenshot(state, photoId, chatId, client);
			break;
		default:
			bot.sendMessage(chatId, "Неожиданное состояние. Попробуйте снова.");
	}
}

// Обработка фото от фотографа
async function handlePhotographerPhoto(msg, state, photographer, photoId) {
	const chatId = msg.chat.id;

	if (!state) {
		return bot.sendMessage(
			chatId,
			"Пожалуйста, используйте команду для добавления фотографий в портфолио."
		);
	}

	switch (state.state) {
		case "awaiting_portfolio_photos":
			await addPortfolioPhoto(state, photoId, chatId);
			break;
		case "cancellingBooking":
			await processCancellationScreenshot(
				state,
				photoId,
				chatId,
				photographer
			);
			break;
		default:
			bot.sendMessage(chatId, "Неожиданное состояние. Попробуйте снова.");
	}
}

// Обработка скриншота оплаты
async function processPaymentScreenshot(state, photoId, chatId, client) {
	const bookingId = state.bookingInfo._id;
	const booking = await Booking.findById(bookingId);

	if (!booking) {
		return bot.sendMessage(
			chatId,
			"Бронирование не найдено. Пожалуйста, попробуйте еще раз."
		);
	}

	booking.paymentScreenshot = photoId;
	booking.status = "awaiting_confirmation";
	await booking.save();

	// Уведомляем фотографа
	const photographer = await Photographer.findById(booking.photographerId);
	if (photographer) {
		await bot.sendPhoto(photographer.telegramId, photoId, {
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

	bot.sendMessage(
		chatId,
		"Спасибо! Ваш скриншот оплаты получен. Ожидайте подтверждения от фотографа."
	);
}

// Обработка скриншота отмены
async function processCancellationScreenshot(state, photoId, chatId, user) {
	const bookingId = state.bookingInfo;
	const booking = await Booking.findById(bookingId);

	if (!booking) {
		return bot.sendMessage(
			chatId,
			"Бронирование не найдено. Пожалуйста, попробуйте еще раз."
		);
	}

	booking.canceledScreenshot = photoId;
	booking.status = "awaiting_cancelling_confirmation";
	await booking.save();

	const recipientId =
		user instanceof Photographer
			? booking.clientId
			: booking.photographerId;
	const recipient = await (user instanceof Photographer
		? Client
		: Photographer
	).findById(recipientId);

	if (recipient) {
		await bot.sendPhoto(recipient.telegramId, photoId, {
			caption: `Запрос отмены от ${user.firstName}. Пожалуйста, подтвердите отмену бронирования или перебронируйте.`,
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: "✅ Подтвердить отмену",
							callback_data: `confirm_cancelling;${booking._id}`,
						},
					],
				],
			},
		});
	}

	bot.sendMessage(
		chatId,
		"Спасибо! Ваш скриншот принят. Ожидайте подтверждения."
	);
}

// Добавление фото в портфолио
async function addPortfolioPhoto(state, photoId, chatId) {
	const tempPhotos = state.tempPhotos || [];
	tempPhotos.push({ file_id: photoId, title: "", category: "" });

	await stateController.setState(chatId, { ...state, tempPhotos });
	bot.sendMessage(
		chatId,
		"Фотография добавлена. Отправьте описание или введите /done для завершения.",
		{ parse_mode: "Markdown" }
	);
}

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
