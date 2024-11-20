let userState = {};

const getUserState = (chatId) => {
	return userState[chatId] || {};
};

// Установка состояния пользователя по chatId
const setUserState = (chatId, state) => {
	userState[chatId] = { ...userState[chatId], ...state };
	console.log(userState);
};

// Удаление состояния пользователя по chatId
const deleteUserState = (chatId) => {
	delete userState[chatId];
};

module.exports = {
	getUserState,
	setUserState,
	deleteUserState,
};
