// Новый, безопасный config.js

// Эта строка нужна для локального тестирования, на сервере она не будет использоваться
require('dotenv').config();

module.exports = {
    // --- СЕКРЕТНЫЕ ДАННЫЕ (читаются с сервера) ---

    // Токен вашего бота
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,

    // ID вашей Google Таблицы
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
    
    // Путь к файлу с ключами. На сервере Render он будет другим.
    GOOGLE_CREDENTIALS_PATH: process.env.GOOGLE_KEYFILE_PATH || './google-credentials.json',

    // ID чата администратора или группы
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,

    // ID администраторов, перечисленные через запятую
    ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
    
    // URL вашего скрипта для обновления таблицы
    APPS_SCRIPT_WEB_APP_URL: process.env.APPS_SCRIPT_WEB_APP_URL,


    // --- ОБЩИЕ НАСТРОЙКИ (не секретные) ---

    MAIN_MENU_SHEET_NAME: 'Справочник',
    SUMMARY_SHEET_NAME: 'Сводка на завтра',
    INTERESTED_MK_SHEET_NAME: 'Цікаві МК',

    SCHEDULE_SHEETS: {
        KIDS: 'Графік дитячі',
        ADULT: 'Графік дорослі',
        INDIVIDUAL: 'Графік індивідуальні',
        GENERAL: 'График'
    },
};