// utils/googleSheets.js
const { google } = require('googleapis');
const config = require('../config'); // Підключаємо наш файл конфігурації
const axios = require('axios'); // Додаємо axios для HTTP-запитів до Web App

let sheets; // Змінна для зберігання об'єкта Google Sheets API
let authClient; // Змінна для зберігання автентифікованого клієнта (для Sheets API)

/**
 * Ініціалізує Google Sheets API клієнт.
 * Використовує сервісний акаунт для автентифікації.
 */
async function initializeGoogleSheets() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: config.GOOGLE_CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'] // Дозволи для роботи з Google Таблицями
        });

        authClient = await auth.getClient();
        sheets = google.sheets({ version: 'v4', auth: authClient });
        console.log('Google Sheets API успішно ініціалізовано!');
    } catch (error) {
        console.error('Помилка ініціалізації Google Sheets API:', error.message);
        process.exit(1);
    }
}

/**
 * Читає дані з вказаного аркуша Google Таблиці.
 * @param {string} sheetName Назва аркуша, з якого потрібно прочитати дані.
 * @returns {Promise<Array<Array<string>>>} Масив масивів, що представляє дані таблиці.
 */
// Вставьте этот код вместо СТАРОЙ функции getSheetData
async function getSheetData(sheetName) {
    if (!sheets) {
        console.error('Google Sheets API не ініціалізовано.');
        return []; // Возвращаем пустой массив, чтобы бот не падал
    }
    
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: config.GOOGLE_SHEET_ID,
            
            // ГЛАВНОЕ ИСПРАВЛЕНИЕ: Добавляем одинарные кавычки вокруг имени листа
            range: `'${sheetName}'!A:Z`, 
            
        });
        return res.data.values || [];

    } catch (err) {
        console.error(`Помилка читання даних з аркуша "${sheetName}":`, err.message);
        return []; 
    }
}

/**
 * Оновлює значення в зазначеній комірці Google Таблиці.
 * @param {string} sheetName Назва аркуша.
 * @param {string} range Діапазон комірки, наприклад 'A1'.
 * @param {string} value Нове значення.
 */
async function updateSheetCell(sheetName, range, value) {
    if (!sheets) {
        await initializeGoogleSheets();
    }

    try {
        await sheets.spreadsheets.values.update({
            spreadsheetId: config.GOOGLE_SHEET_ID,
            range: `${sheetName}!${range}`,
            valueInputOption: 'RAW',
            resource: {
                values: [[value]]
            }
        });
        console.log(`Комірка ${sheetName}!${range} успішно оновлена на: ${value}`);
    } catch (error) {
        console.error(`Помилка оновлення комірки ${sheetName}!${range}:`, error.message);
    }
}

/**
 * Додає новий рядок даних до вказаного аркуша Google Таблиці.
 * @param {string} sheetName Назва аркуша, куди потрібно додати рядок.
 * @param {Array<string|number>} rowData Масив даних для додавання.
 * @param {number} rowNumber Опціонально: номер рядка для обновления, если не добавляется новый.
 */
async function appendOrUpdateSheetRow(sheetName, rowData, rowNumber = null) {
    if (!sheets) {
        await initializeGoogleSheets();
    }

    try {
        if (rowNumber) {
            // Обновляем существующий ряд
            const range = `A${rowNumber}`; // Предполагаем, что обновляем начиная с колонки A
            await sheets.spreadsheets.values.update({
                spreadsheetId: config.GOOGLE_SHEET_ID,
                range: `${sheetName}!${range}`,
                valueInputOption: 'RAW',
                resource: {
                    values: [rowData]
                }
            });
            console.log(`Рядок ${rowNumber} успішно оновлено в аркуші "${sheetName}".`);
        } else {
            // Добавляем новый ряд
            await sheets.spreadsheets.values.append({
                spreadsheetId: config.GOOGLE_SHEET_ID,
                range: `${sheetName}!A:A`,
                valueInputOption: 'RAW',
                resource: {
                    values: [rowData]
                }
            });
            console.log(`Рядок успішно додано до аркуша "${sheetName}".`);
        }
    } catch (error) {
        console.error(`Помилка додавання/оновлення рядка до аркуша "${sheetName}":`, error.message);
    }
}


/**
 * Викликає Google Apps Script через його Web App URL.
 */
async function triggerAppsScriptUpdate() {
    if (!config.APPS_SCRIPT_WEB_APP_URL) {
        console.error('APPS_SCRIPT_WEB_APP_URL не налаштовано в конфігурації!');
        return { success: false, error: 'APPS_SCRIPT_WEB_APP_URL не налаштовано' };
    }
    try {
        const response = await axios.get(config.APPS_SCRIPT_WEB_APP_URL);
        console.log('Виклик Google Apps Script Web App успішний:', response.data);
        return { success: true, response: response.data };
    } catch (error) {
        console.error('Помилка при виклику Google Apps Script Web App:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeGoogleSheets,
    getSheetData,
    updateSheetCell,
    appendOrUpdateSheetRow, // Изменено на appendOrUpdateSheetRow
    triggerAppsScriptUpdate
};
