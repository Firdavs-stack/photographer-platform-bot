// controllers/stateController.js

// Internal storage for user states
const userStates = {};

/**
 * Sets the state for a specific user.
 * @param {Number} chatId - The chat ID of the user.
 * @param {Object} newState - The new state to set.
 */
function setState(chatId, newState) {
	userStates[chatId] = newState;
}

/**
 * Retrieves the current state of a user.
 * @param {Number} chatId - The chat ID of the user.
 * @returns {Object|null} - The current state of the user or null if not set.
 */
function getState(chatId) {
	return userStates[chatId] || null;
}

/**
 * Clears the current state of a user.
 * @param {Number} chatId - The chat ID of the user.
 */
function clearState(chatId) {
	delete userStates[chatId];
}

/**
 * Updates specific fields in the user's state.
 * @param {Number} chatId - The chat ID of the user.
 * @param {Object} update - An object containing the fields to update.
 */
function updateState(chatId, update) {
	const currentState = getState(chatId) || {};
	userStates[chatId] = { ...currentState, ...update };
}

module.exports = {
	setState,
	getState,
	clearState,
	updateState,
};
