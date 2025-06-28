// bot.js

const TelegramBot = require('node-telegram-bot-api');

const config = require('./config');

const { initializeGoogleSheets, getSheetData, updateSheetCell, appendOrUpdateSheetRow, triggerAppsScriptUpdate } = require('./utils/googleSheets');

const fs = require('fs');

const path = require('path');


const path = require('path');
const express = require('express'); // НОВЕ: Імпорт Express
const app = express(); // НОВЕ: Ініціалізація Express-додатка
app.use(express.json()); // НОВЕ: Middleware для розбору JSON-тіла запиту (для вебхуків)


// --- НАСТРОЙКИ ВЕБХУКА ---
// Render автоматично надає ці змінні оточення
const TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Ваш токен бота, береться з змінних оточення Render
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_HOSTNAME; // Публічний URL вашого сервісу на Render
const PORT = process.env.PORT; // Порт, на якому ваш сервер буде слухати запити від Render

// 2. Створюємо ЄДИНИЙ екземпляр бота (ВАЖЛИВО: видаляємо { polling: true })
const bot = new TelegramBot(TOKEN);

// 4. Визначаємо маршрут (endpoint) для вебхука Telegram.
app.post(`/bot${TOKEN}`, (req, res) => {
    // Обробляємо вхідне оновлення, передаючи його в бібліотеку node-telegram-bot-api
    bot.processUpdate(req.body);
    // ДУЖЕ ВАЖЛИВО: Відповідаємо Telegram'у статусом 200 OK.
    res.sendStatus(200);
});



// --- УСТАНОВКА КОМАНД МЕНЮ ---

async function setBotCommands() {

    try {

        await bot.setMyCommands([

            { command: 'start', description: 'Розпочати роботу з ботом' },

            { command: 'mk_classes', description: 'Майстер-класи' },

            { command: 'services', description: 'Послуги' },

            { command: 'faq', description: 'Поширені питання' },

            { command: 'contacts', description: 'Зв\'язатись з нами' },

        ]);

        console.log('Команди меню успішно встановлені.');

    } catch (error) {

        console.error('Помилка при встановленні команд меню:', error.message);

    }

}





// Состояние пользователей для обработки многошаговых сценариев

const userStates = new Map(); // Map<chatId, { step: string, data: object }>



// Вспомогательная функция для задержки

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));



// --- НОВАЯ ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ АДМИНИСТРАТОРА ---

/**

 * Проверяет, является ли пользователь администратором.

 * @param {number|string} chatId ID пользователя.

 * @returns {boolean} True, если пользователь админ.

 */

function isAdmin(chatId) {

    // Убедимся, что сравниваем строки со строками для надежности

    return config.ADMIN_IDS.map(String).includes(String(chatId));

}



// ----- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ФОРМАТИРОВАНИЯ СООБЩЕНИЙ -----



function getMkFullName(mkType) {

    switch (mkType) {

        case 'дитячий':

            return '"Дитячий МК в міні-групі" (від п\'яти до п\'ятнадцяти років)';

        case 'дорослий':

            return '"Дорослий МК в міні-групі"';

        case 'індивідуальний':

            return '"Індивідуальний МК"';

        default:

            return mkType;

    }

}



function formatParticipants(count) {

    const num = Math.abs(count);

    if (num % 10 === 1 && num % 100 !== 11) {

        return `${count} учасник`;

    }

    if ([2, 3, 4].includes(num % 10) && ![12, 13, 14].includes(num % 100)) {

        return `${count} учасника`;

    }

    return `${count} учасників`;

}



function formatDateForMessage(dateString) {

    const date = new Date(dateString);

    const day = String(date.getDate()).padStart(2, '0');

    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${day}.${month}`;

}



// ----- КОНЕЦ ВСПОМОГАТЕЛЬНЫХ ФУНКЦИЙ -----



// Функция для получения данных пользователя из таблицы "Цікаві МК"

async function getUserDataFromSheet(userId) {

    const data = await getSheetData(config.INTERESTED_MK_SHEET_NAME);

    const headers = data[0] || [];

    const userIdColIndex = headers.indexOf('User ID');

    const usernameColIndex = headers.indexOf('Username');

    const firstNameColIndex = headers.indexOf('First Name');

    const lastNameColIndex = headers.indexOf('Last Name');

    const phoneColIndex = headers.indexOf('Phone Number');



    if (userIdColIndex === -1 || phoneColIndex === -1 || firstNameColIndex === -1) {

        console.warn('Не знайдені потрібні заголовки (User ID, Phone Number, First Name) на листі "Цікаві МК".');

        return null;

    }



    for (let i = 1; i < data.length; i++) {

        const row = data[i];

        if (String(row[userIdColIndex]) === String(userId)) {

            return {

                rowNumber: i + 1, // Номер строки в таблице

                id: row[userIdColIndex],

                username: row[usernameColIndex] || '',

                first_name: row[firstNameColIndex] || '',

                last_name: row[lastNameColIndex] || '',

                phone_number: row[phoneColIndex] || ''

            };

        }

    }

    return null;

}



// Функция для обновления информации о пользователе в таблице "Цікаві МК"

async function updateUserInfoInSheet(userId, username, firstName, lastName, phoneNumber) {

    const data = await getSheetData(config.INTERESTED_MK_SHEET_NAME);

    const headers = data[0] || [];

    const userIdColIndex = headers.indexOf('User ID');

    const usernameColIndex = headers.indexOf('Username');

    const firstNameColIndex = headers.indexOf('First Name');

    const lastNameColIndex = headers.indexOf('Last Name');

    const phoneColIndex = headers.indexOf('Phone Number');



    if ([userIdColIndex, usernameColIndex, firstNameColIndex, lastNameColIndex, phoneColIndex].includes(-1)) {

        console.warn('Не знайдені всі потрібні заголовки на листі "Цікаві МК" для оновлення.');

        return;

    }



    let existingRowNumber = -1;

    let existingRow = null;

    for (let i = 1; i < data.length; i++) {

        if (String(data[i][userIdColIndex]) === String(userId)) {

            existingRowNumber = i + 1;

            existingRow = [...data[i]];

            break;

        }

    }



    const rowDataToUpdate = existingRow ? [...existingRow] : new Array(headers.length).fill('');

    rowDataToUpdate[userIdColIndex] = userId;

    rowDataToUpdate[usernameColIndex] = username;

    rowDataToUpdate[firstNameColIndex] = firstName;

    rowDataToUpdate[lastNameColIndex] = lastName;

    rowDataToUpdate[phoneColIndex] = phoneNumber;

    if (rowDataToUpdate.length < headers.length) rowDataToUpdate.length = headers.length;



    if (existingRowNumber !== -1) {

        await appendOrUpdateSheetRow(config.INTERESTED_MK_SHEET_NAME, rowDataToUpdate, existingRowNumber);

        console.log(`Оновлено інформацію про користувача ${userId} у рядку ${existingRowNumber}`);

    } else {

        await appendOrUpdateSheetRow(config.INTERESTED_MK_SHEET_NAME, [

            new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),

            userId, username, firstName, lastName, phoneNumber,

            '', '', '', '', 'Інфо оновлено'

        ]);

        console.log(`Додано нову інформацію про користувача ${userId}`);

    }

}

/**

 * Отправляет сообщения и кнопки из данных таблицы для одного ID_МЕНЮ.

 * @param {number} chatId ID чата

 * @param {Array<object>} menuData Массив объектов меню

 * @param {object} userData Данные пользователя

 * @param {boolean} [isMainMenuForAdmin=false] Флаг для добавления админ-кнопки в главное меню

 */

async function sendMenu(chatId, menuData, userData = {}, isMainMenuForAdmin = false) {

    let lastSentContentMessageId = null;

    let lastSentContentMessageText = '';

    const inlineKeyboardButtons = [];



    for (const item of menuData) {

        const text = item['ТЕКСТ/НАЗВАНИЕ'] || '';

        const timing = parseInt(item['Таймінг'] || '0', 10);

        const type = item['ТИП_ЭЛЕМЕНТА'];

        const callbackData = item['CALLBACK_DATA (для кнопок)'];

        const note = item['Примечание'] || '';

        const albumPhotoPaths = item['АЛЬБОМ_ФОТО_ПУТИ'] || '';



        if (timing > 0) await sleep(timing);



        let parsedText = text.replace('{{name}}', userData.first_name || 'друг');

        const phoneRegex = /(\+?\d{1,3}[\s-]?\(?\d{2,3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2,})/g;

        parsedText = parsedText.replace(phoneRegex, (match) => `<a href="tel:${match.replace(/[^\d+]/g, '')}">${match}</a>`);



        let currentContentMessageId = null;

        let currentContentMessageText = null;



        if ((type === 'message' || type === 'photo' || type === 'location') && lastSentContentMessageId && inlineKeyboardButtons.length > 0) {

            try {

                await bot.editMessageReplyMarkup({ inline_keyboard: inlineKeyboardButtons }, { chat_id: chatId, message_id: lastSentContentMessageId });

            } catch (e) {

                // Игнорируем ошибку, если не удалось отредактировать (например, сообщение слишком старое)

                console.warn(`Не удалось добавить кнопки к предыдущему сообщению: ${e.message}`);

            }

            inlineKeyboardButtons.length = 0;

        }



        if (type === 'message') {

            const msg = await bot.sendMessage(chatId, parsedText, { parse_mode: 'HTML' });

            currentContentMessageId = msg.message_id;

            currentContentMessageText = parsedText;

        } else if (type === 'photo') {

            const photoSources = albumPhotoPaths.split(',').map(p => p.trim()).filter(p => p);

            let primaryPhotoSource = photoSources.length > 0 ? photoSources[0] : (callbackData || '');

            const isLocalFileSource = (source) => source && (source.startsWith('./') || (!source.startsWith('http://') && !source.startsWith('https://')));



            if (photoSources.length > 1) {

                const mediaGroup = [];

                for (const albumPath of photoSources) {

                    try {

                        const mediaObject = {

                            type: 'photo',

                            media: isLocalFileSource(albumPath) ? fs.createReadStream(path.resolve(__dirname, albumPath)) : albumPath,

                            caption: mediaGroup.length === 0 ? parsedText : undefined,

                            parse_mode: 'HTML'

                        };

                        mediaGroup.push(mediaObject);

                    } catch (albumFileError) {

                        console.error(`Ошибка при подготовке фото для альбома (${albumPath}):`, albumFileError.message);

                    }

                }

                if (mediaGroup.length > 0) {

                    const sentMsgs = await bot.sendMediaGroup(chatId, mediaGroup).catch(e => console.error(`Ошибка отправки альбома: ${e.message}`));

                    if (sentMsgs && sentMsgs.length > 0) {

                        currentContentMessageId = sentMsgs[0].message_id;

                        currentContentMessageText = parsedText;

                    }

                }

            } else if (primaryPhotoSource) {

                try {

                    const photo = isLocalFileSource(primaryPhotoSource) ? fs.createReadStream(path.resolve(__dirname, primaryPhotoSource)) : primaryPhotoSource;

                    const msg = await bot.sendPhoto(chatId, photo, { caption: parsedText, parse_mode: 'HTML' });

                    currentContentMessageId = msg.message_id;

                    currentContentMessageText = parsedText;

                } catch (photoError) {

                    console.error(`Ошибка отправки фото (${primaryPhotoSource}):`, photoError.message);

                }

            }

        } else if (type === 'location') {

            const latMatch = note.match(/Широта:\s*([+-]?\d+\.?\d*)/);

            const lonMatch = note.match(/Довгота:\s*([+-]?\d+\.?\d*)/);



            if (latMatch && lonMatch) {

                try {

                    const latitude = parseFloat(latMatch[1]);

                    const longitude = parseFloat(lonMatch[1]);

                    await bot.sendLocation(chatId, latitude, longitude);

                } catch (e) {

                    console.error(`Помилка парсингу координат:`, e);

                }

            }

            if (parsedText) {

                const msg = await bot.sendMessage(chatId, parsedText, { parse_mode: 'HTML' });

                currentContentMessageId = msg.message_id;

                currentContentMessageText = parsedText;

            }

        } else if (type === 'button') {

            let buttonUrl;

            let buttonCallbackData;

            const linkRegex = /^https?:\/\//;

            if (linkRegex.test(callbackData)) buttonUrl = callbackData;

            else if (linkRegex.test(note)) buttonUrl = note;

            else buttonCallbackData = callbackData;



            inlineKeyboardButtons.push([{ text: parsedText, callback_data: buttonCallbackData, url: buttonUrl }]);

        }



        if (currentContentMessageId) {

            lastSentContentMessageId = currentContentMessageId;

            lastSentContentMessageText = currentContentMessageText;

        }

    }



    if (isMainMenuForAdmin && isAdmin(chatId)) {

        inlineKeyboardButtons.push([{ text: '⚙️ Системне', callback_data: 'admin_menu' }]);

    }



    if (inlineKeyboardButtons.length > 0) {

        const replyMarkup = { inline_keyboard: inlineKeyboardButtons };

        const targetMessageId = lastSentContentMessageId;

        const targetMessageText = lastSentContentMessageText || 'Оберіть опцію:';



        if (targetMessageId) {

            try {

                await bot.editMessageReplyMarkup(replyMarkup, { chat_id: chatId, message_id: targetMessageId });

            } catch (error) {

                if (!error.message.includes('message is not modified')) {

                    await bot.sendMessage(chatId, targetMessageText, { reply_markup: replyMarkup, parse_mode: 'HTML' });

                }

            }

        } else {

            await bot.sendMessage(chatId, 'Оберіть опцію:', { reply_markup: replyMarkup });

        }

    }

}



/**

 * Загружает и кэширует данные меню из Google Таблицы.

 */

let mainMenuCache = new Map();

async function loadMenuData() {

    try {

        const data = await getSheetData(config.MAIN_MENU_SHEET_NAME);

        if (data.length === 0) {

            console.warn('У таблиці меню немає даних.');

            return;

        }



        const headers = data[0];

        const rows = data.slice(1);

        const newCache = new Map();



        for (const row of rows) {

            const item = headers.reduce((obj, header, index) => {

                obj[header] = row[index] !== undefined ? String(row[index]) : '';

                return obj;

            }, {});



            const menuId = item['ID_МЕНЮ'];

            if (menuId) {

                if (!newCache.has(menuId)) {

                    newCache.set(menuId, []);

                }

                newCache.get(menuId).push(item);

            }

        }

        mainMenuCache = newCache;

        console.log('Дані меню успішно завантажено та кешовано.');

    } catch (error) {

        console.error('Помилка завантаження даних меню:', error.message);

    }

}



// Обновляем кэш меню каждые 30 минут

setInterval(loadMenuData, 30 * 60 * 1000);





// --- НОВЫЕ ФУНКЦИИ ДЛЯ АДМИН-ПАНЕЛИ ---



/**

 * Отправляет админу выбор типа МК для записи или отмены.

 * @param {number|string} chatId ID админа

 * @param {'record' | 'cancel'} actionType Тип действия

 */

async function sendAdminMkTypeSelection(chatId, actionType) {

    const actionText = actionType === 'record' ? 'записати' : 'скасувати запис';

    const callbackPrefix = `admin_select_mk_${actionType}_`;



    const inline_keyboard = [

        [{ text: 'Дитячий', callback_data: `${callbackPrefix}дитячий` }],

        [{ text: 'Дорослий', callback_data: `${callbackPrefix}дорослий` }],

        [{ text: 'Індивідуальний', callback_data: `${callbackPrefix}індивідуальний` }],

        [{ text: '🔙 Назад', callback_data: 'admin_menu' }]

    ];



    await bot.sendMessage(chatId, `Оберіть тип МК, для якого потрібно ${actionText}:`, {

        reply_markup: { inline_keyboard }

    });

}



/**

 * Отправляет админу список слотов для выбора.

 * @param {number|string} chatId ID админа

 * @param {string} mkType Тип МК

 * @param {'record' | 'cancel'} actionType Тип действия

 */

async function sendAdminSlotSelection(chatId, mkType, actionType) {

    try {

        const scheduleData = await getSheetData(config.SCHEDULE_SHEETS.GENERAL);

        if (scheduleData.length < 2) {

            await bot.sendMessage(chatId, 'Помилка: не вдалося завантажити дані з аркуша "Графік".');

            return;

        }



        const headers = scheduleData[0];

        const dateCol = headers.indexOf('Дата');

        const timeCol = headers.indexOf('Час');

        const typeCol = headers.indexOf('Тип МК');

        const bookedCol = headers.indexOf('Записано');

        const statusCol = headers.indexOf('Віконце');

        const maxCol = headers.indexOf('Макс. учасників');



        if ([dateCol, timeCol, typeCol, bookedCol, statusCol, maxCol].includes(-1)) {

            await bot.sendMessage(chatId, 'Помилка: відсутні необхідні колонки в аркуші "Графік".');

            return;

        }



        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));

        const relevantSlots = [];



        for (let i = 1; i < scheduleData.length; i++) {

            const row = scheduleData[i];

            const eventDate = new Date(row[dateCol]);

            if (eventDate < now) continue;



            const isCorrectMkType = row[typeCol] === mkType;

            const currentBooked = parseInt(row[bookedCol], 10) || 0;

            const maxParticipants = parseInt(row[maxCol], 10) || Infinity;



            const isAvailableForRecord = actionType === 'record' && row[statusCol] === 'Доступне' && currentBooked < maxParticipants;

            const isOccupiedForCancel = actionType === 'cancel' && currentBooked > 0;



            if (isCorrectMkType && (isAvailableForRecord || isOccupiedForCancel)) {

                relevantSlots.push({

                    rowNum: i + 1,

                    date: row[dateCol],

                    time: row[timeCol],

                    booked: currentBooked,

                    max: maxParticipants === Infinity ? '∞' : maxParticipants

                });

            }

        }



        if (relevantSlots.length === 0) {

            const message = actionType === 'record'

                ? `Немає доступних віконець для запису на "${mkType}" МК.`

                : `Немає зайнятих віконець для скасування запису на "${mkType}" МК.`;

            await bot.sendMessage(chatId, message);

            return;

        }



        relevantSlots.sort((a, b) => new Date(a.date) - new Date(b.date) || a.time.localeCompare(b.time));



        const inline_keyboard = relevantSlots.map(slot => {

            const formattedDate = new Date(slot.date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });

            const buttonText = actionType === 'record'

                ? `🗓️ ${formattedDate}, ${slot.time} (Записано: ${slot.booked}/${slot.max})`

                : `🗓️ ${formattedDate}, ${slot.time} (Записано: ${slot.booked})`;

            const callback_data = `admin_select_slot_${actionType}_${slot.rowNum}`;

            return [{ text: buttonText, callback_data }];

        });



        const backCallback = `admin_start_${actionType}`;

        inline_keyboard.push([{ text: '🔙 Назад до вибору МК', callback_data: backCallback }]);



        const actionText = actionType === 'record' ? 'запису' : 'скасування';

        await bot.sendMessage(chatId, `Оберіть віконце для ${actionText}:`, {

            reply_markup: { inline_keyboard }

        });

    } catch (error) {

        console.error("[sendAdminSlotSelection] Error:", error);

        await bot.sendMessage(chatId, "Сталася помилка при отриманні слотів.");

    }

}



/**

 * Запускает процесс подтверждения записей на завтра.

 * @param {number|string} chatId ID чата администратора.

 */

async function startConfirmationProcess(chatId) {

    try {

        await bot.sendMessage(chatId, '⏳ Завантажую зведення на завтра...');

        const summaryData = await getSheetData(config.SUMMARY_SHEET_NAME);



        if (summaryData.length <= 1) { // <= 1, чтобы учесть строку с заголовками

            await bot.sendMessage(chatId, '✅ На завтра записів через бота немає.');

            return;

        }



        const headers = summaryData[0].map(h => h.trim());

        const requiredHeaders = ['User ID', 'First Name', 'MK Type', 'Date', 'Time', 'Participants'];

        if (!requiredHeaders.every(h => headers.includes(h))) {

            await bot.sendMessage(chatId, `❌ Помилка: у листі "Сводка на завтра" відсутні необхідні заголовки. Потрібні: ${requiredHeaders.join(', ')}`);

            return;

        }

        const records = summaryData.slice(1).map(row => {

            const record = {};

            headers.forEach((header, index) => {

                record[header] = row[index];

            });

            return record;

        });



        const groupedByTime = {};

        for (const record of records) {

            const time = record['Time']; // <-- ИСПРАВЛЕНИЕ: Берем время напрямую

            if (!groupedByTime[time]) {

                groupedByTime[time] = {

                    totalParticipants: 0,

                    clients: []

                };

            }

            groupedByTime[time].totalParticipants += parseInt(record['Participants'], 10);

            groupedByTime[time].clients.push(record['First Name']);

        }



        let summaryMessage = `🔔 **Зведення записів на завтра:**\n\n`;

        const sortedTimes = Object.keys(groupedByTime).sort();



        for (const time of sortedTimes) {

            const { totalParticipants, clients } = groupedByTime[time];

            summaryMessage += `🔹 **${time}** - ${formatParticipants(totalParticipants)} (${clients.join(', ')})\n`;

        }



        // Сохраняем все записи в состояние администратора для последующей отправки

        userStates.set(chatId, {

            step: 'awaiting_confirmation_choice',

            data: { recordsToConfirm: records }

        });



        const inline_keyboard = [

            [{ text: '✅ Підтвердити для всіх', callback_data: 'confirm_all_clients' }],

            // [{ text: '📝 Підтвердити вибірково', callback_data: 'confirm_selective' }], // Эту кнопку можно добавить позже

            [{ text: '◀️ Назад до меню', callback_data: 'admin_menu' }]

        ];



        await bot.sendMessage(chatId, summaryMessage, {

            parse_mode: 'Markdown',

            reply_markup: { inline_keyboard }

        });



    } catch (error) {

        console.error('[startConfirmationProcess] Error:', error.message, error.stack);

        await bot.sendMessage(chatId, '❌ Сталася помилка під час завантаження зведення.');

    }

}

// --- ОБРАБОТЧИКИ КОМАНД ---



bot.onText(/\/start/, async (msg) => {

    const chatId = msg.chat.id;

    userStates.set(chatId, { step: 'main', data: {} });

    const mainMenu = mainMenuCache.get('main');

    if (mainMenu) {

        // Передаем 'true' в последнем параметре, чтобы функция знала, 

        // что нужно проверить ID и, если это админ, добавить системную кнопку

        await sendMenu(chatId, mainMenu, msg.from, true);

    } else {

        await bot.sendMessage(chatId, 'Вибачте, головне меню не знайдено.');

    }

});



bot.onText(/\/mk_classes/, (msg) => {

    userStates.set(msg.chat.id, { step: 'mk_classes', data: {} });

    const menuData = mainMenuCache.get('mk_classes');

    if (menuData) {

        sendMenu(msg.chat.id, menuData, msg.from);

    } else {

        bot.sendMessage(msg.chat.id, 'Вибачте, меню майстер-класів не знайдено.');

    }

});



bot.onText(/\/services/, (msg) => {

    userStates.set(msg.chat.id, { step: 'services', data: {} });

    const menuData = mainMenuCache.get('services');

    if (menuData) {

        sendMenu(msg.chat.id, menuData, msg.from);

    } else {

        bot.sendMessage(msg.chat.id, 'Вибачте, меню послуг не знайдено.');

    }

});



bot.onText(/\/faq/, (msg) => {

    userStates.set(msg.chat.id, { step: 'faq', data: {} });

    const menuData = mainMenuCache.get('faq');

    if (menuData) {

        sendMenu(msg.chat.id, menuData, msg.from);

    } else {

        bot.sendMessage(msg.chat.id, 'Вибачте, розділ "Поширені питання" не знайдено.');

    }

});



bot.onText(/\/contacts/, (msg) => {

    userStates.set(msg.chat.id, { step: 'contacts', data: {} });

    const menuData = mainMenuCache.get('contacts');

    if (menuData) {

        sendMenu(msg.chat.id, menuData, msg.from);

    } else {

        bot.sendMessage(msg.chat.id, 'Вибачте, інформація для зв\'язку не знайдена.');

    }

});



// --- НОВАЯ КОМАНДА ДЛЯ АДМИНА: Перезагрузка меню ---

bot.onText(/\/reloadmenu/, async (msg) => {

    const chatId = msg.chat.id;



    // Проверяем, что команду отправил администратор

    if (!isAdmin(chatId)) {

        // Обычным пользователям ничего не отвечаем, чтобы не раскрывать команду

        console.log(`Пользователь ${chatId} попытался использовать команду /reloadmenu`);

        return;

    }



    try {

        await bot.sendMessage(chatId, '⏳ Перезавантажую дані меню з Google Таблиці...');

        await loadMenuData(); // Вызываем нашу функцию для загрузки данных

        await bot.sendMessage(chatId, '✅ Кеш меню успішно оновлено!');

    } catch (error) {

        console.error('Помилка при ручному перезавантаженні меню:', error);

        await bot.sendMessage(chatId, '❌ Сталася помилка під час оновлення меню.');

    }

});



// --- ГЛАВНЫЙ ОБРАБОТЧИК CALLBACK-КНОПОК ---

bot.on('callback_query', async (query) => {

    const chatId = query.message.chat.id;

    const data = query.data;

    const currentState = userStates.get(chatId) || { step: 'main', data: {} };



    try { await bot.answerCallbackQuery(query.id); } catch (e) {

        if (!e.message.includes('query is too old')) {

            console.error(`Ошибка при ответе на callback_query:`, e.message);

        }

    }



    console.log(`[callback_query] User: ${chatId}, Data: "${data}"`);



    // ===================================================================

    // БЛОК 1: Логика для Администратора (ручные действия и запуск подтверждений)

    // ===================================================================

    if (isAdmin(chatId) && data.startsWith('admin_')) {

        const parts = data.split('_');

        const command = parts[1];



        if (command === 'menu') {

            userStates.set(chatId, { step: 'admin_main', data: {} });

            const inline_keyboard = [

                [{ text: '✍️ Записати учасників', callback_data: 'admin_start_record' }],

                [{ text: '❌ Скасувати запис', callback_data: 'admin_start_cancel' }],

                [{ text: '📣 Розпочати підтвердження', callback_data: 'admin_start_confirmation' }],

                [{ text: '🔙 Головне меню', callback_data: 'back_to_main' }]

            ];

            await bot.sendMessage(chatId, '⚙️ Системне меню', { reply_markup: { inline_keyboard } });

            return;

        }



        if (command === 'start') {

            if (parts[2] === 'confirmation') {

                await startConfirmationProcess(chatId);

                return;

            }

            const actionType = parts[2]; // 'record' или 'cancel'

            userStates.set(chatId, { step: `admin_${actionType}_select_mk`, data: {} });

            await sendAdminMkTypeSelection(chatId, actionType);

            return;

        }



        if (command === 'select') {

            const entity = parts[2];

            const actionType = parts[3];



            if (entity === 'mk') {

                const mkType = parts[4];

                userStates.set(chatId, { step: `admin_${actionType}_select_slot`, data: { mkType } });

                await sendAdminSlotSelection(chatId, mkType, actionType);

            } else if (entity === 'slot') {

                const rowNum = parseInt(parts[4], 10);

                userStates.set(chatId, {

                    step: `admin_await_${actionType}_count`,

                    data: { ...currentState.data, rowNum }

                });

                const actionText = actionType === 'record' ? 'записати' : 'скасувати';

                await bot.sendMessage(chatId, `Введіть кількість учасників, яку потрібно ${actionText}:`);

            }

            return;

        }

    }



    // ===================================================================

    // БЛОК 2: Логика процесса подтверждения (начинается админом, продолжается клиентом)

    // ===================================================================



    // ЗАМЕНИТЕ ВАШ СТАРЫЙ БЛОК НА ЭТОТ

    if (data === 'confirm_all_clients') {

        if (!isAdmin(chatId)) return;



        const adminState = userStates.get(chatId);

        if (!adminState || !adminState.data || !adminState.data.recordsToConfirm) {

            await bot.sendMessage(chatId, 'Помилка: дані для підтвердження застаріли. Спробуйте знову.');

            return;

        }



        const { recordsToConfirm } = adminState.data;

        if (recordsToConfirm.length === 0) {

            await bot.sendMessage(chatId, 'Немає записів для підтвердження.');

            return;

        }



        // --- НОВАЯ ЛОГИКА: Группировка записей по User ID ---

        const clientsData = {};

        for (const record of recordsToConfirm) {

            const clientChatId = record['User ID'];

            if (!clientsData[clientChatId]) {

                clientsData[clientChatId] = {

                    name: record['First Name'],

                    bookings: []

                };

            }

            clientsData[clientChatId].bookings.push({

                date: record['Date'],

                time: record['Time'],

                participants: record['Participants']

            });

        }

        // --- КОНЕЦ НОВОЙ ЛОГИКИ ---



        await bot.sendMessage(chatId, `🚀 Розпочинаю відправку підтверджень для ${Object.keys(clientsData).length} унікальних клієнтів...`);



        for (const clientChatId in clientsData) {

            const client = clientsData[clientChatId];

            const clientName = client.name;



            let bookingsText = '';

            let totalParticipants = 0;



            for (const booking of client.bookings) {

                const formattedDate = new Date(booking.date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });

                bookingsText += `\n- **${formattedDate} о ${booking.time}** (${formatParticipants(parseInt(booking.participants, 10))})`;

                totalParticipants += parseInt(booking.participants, 10);

            }



            try {

                const messageText = `Доброго дня, ${clientName}!☺️\n\n` +

                    `Нагадуємо про ваш запис (записи) на майстер-клас завтра:${bookingsText}\n\n` +

                    `Будь ласка, підтвердьте свою присутність.`;



                // Теперь в ID для отмены передаем только ID клиента и общее кол-во участников

                // Дата и время будут найдены в таблице по ID клиента

                const recordId = `${clientChatId}_${totalParticipants}`;



                const inline_keyboard = [

                    [{ text: '✅ Так, я буду', callback_data: `client_confirm_${recordId}` }],

                    [{ text: '❌ Змінились плани, скасуйте запис', callback_data: `client_cancel_all_${recordId}` }], // Новая команда отмены

                    [{ text: '❓ З\'явились питання?', callback_data: `client_question_${recordId}` }]

                ];



                await bot.sendMessage(clientChatId, messageText, {

                    parse_mode: 'Markdown',

                    reply_markup: { inline_keyboard }

                });

                await sleep(300);

            } catch (e) {

                console.error(`Не вдалося відправити повідомлення клієнту ${clientChatId}:`, e);

                await bot.sendMessage(chatId, `⚠️ Не вдалося відправити повідомлення клієнту ${clientName} (ID: ${clientChatId}).`);

            }

        }

        await bot.sendMessage(chatId, '✅ Відправку завершено!');

        userStates.delete(chatId);

        return;

    }



    // ЗАМЕНИТЕ ВАШ СТАРЫЙ БЛОК 'client_confirm_' НА ЭТОТ

    // ЗАМЕНИТЕ ВАШ СТАРЫЙ БЛОК 'client_confirm_' НА ЭТОТ

    if (data.startsWith('client_confirm_')) {

        const clientChatId = data.split('_')[2];

        const clientName = query.from.first_name;



        await bot.sendMessage(chatId, `Дякуємо за підтвердження, ${clientName}! ❤️\nЧекаємо на вас!`, {

            reply_markup: {

                inline_keyboard: [[

                    { text: '📍 Де ми знаходимось?', callback_data: 'show_location' },

                    { text: '❓ Поширені питання', callback_data: 'faq' }

                ]]

            }

        });



        // --- НОВАЯ ЛОГИКА: Собираем данные для админа ---

        try {

            if (config.ADMIN_CHAT_ID) {

                // Получаем номер телефона

                const userData = await getUserDataFromSheet(clientChatId);

                const phoneNumber = userData ? userData.phone_number : 'не знайдено';



                // Получаем детали записей из сводки

                const summaryData = await getSheetData(config.SUMMARY_SHEET_NAME);

                const headers = summaryData[0].map(h => h.trim());

                const userIdCol = headers.indexOf('User ID');



                const clientBookings = summaryData.slice(1).filter(row => row[userIdCol] === clientChatId);



                let bookingsDetails = '';

                if (clientBookings.length > 0) {

                    const dateCol = headers.indexOf('Date');

                    const timeCol = headers.indexOf('Time');

                    const participantsCol = headers.indexOf('Participants');



                    bookingsDetails = clientBookings.map(b =>

                        `\n- ${new Date(b[dateCol]).toLocaleDateString('uk-UA')} о ${b[timeCol]} (${formatParticipants(parseInt(b[participantsCol], 10))})`

                    ).join('');

                }



                const adminMessage = `✅ **Клієнт підтвердив запис**\n\n` +

                    `<b>Ім'я:</b> ${clientName}\n` +

                    `<b>Телефон:</b> ${phoneNumber}\n` +

                    `<b>ID:</b> ${clientChatId}\n` +

                    `<b>Записи:</b>${bookingsDetails}`;



                await bot.sendMessage(config.ADMIN_CHAT_ID, adminMessage, { parse_mode: 'HTML' });

            }

        } catch (e) {

            console.error("Помилка при відправці розширеного повідомлення адміну:", e);

            // Отправляем простое уведомление, если что-то пошло не так

            await bot.sendMessage(config.ADMIN_CHAT_ID, `✅ Клієнт ${clientName} (ID: ${chatId}) підтвердив(ла) свій запис.`);

        }

        // --- ДОБАВЛЕНО: Убираем кнопки с исходного сообщения ---

        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id });

        return;

    }

    // ЗАМЕНИТЕ ВАШ СТАРЫЙ БЛОК 'client_cancel_all_' НА ЭТОТ

    if (data.startsWith('client_cancel_all_')) {

        const clientChatIdToCancel = data.split('_')[3];

        const clientName = query.from.first_name;



        await bot.sendMessage(chatId, 'Дуже шкода, що ваші плани змінились. Всі ваші записи на завтра скасовано. Будемо раді бачити вас іншим разом! ✨');



        try {

            // Получаем номер телефона

            const userData = await getUserDataFromSheet(clientChatIdToCancel);

            const phoneNumber = userData ? userData.phone_number : 'не знайдено';



            // Получаем детали записей для отмены

            const summaryData = await getSheetData(config.SUMMARY_SHEET_NAME);

            if (!summaryData || summaryData.length <= 1) return;



            const headers = summaryData[0].map(h => h.trim());

            const userIdCol = headers.indexOf('User ID');

            const dateCol = headers.indexOf('Date');

            const timeCol = headers.indexOf('Time');

            const participantsCol = headers.indexOf('Participants');



            const recordsToCancel = summaryData.slice(1).filter(row => row[userIdCol] === clientChatIdToCancel);



            let bookingsDetails = '';

            if (recordsToCancel.length > 0) {

                bookingsDetails = recordsToCancel.map(b =>

                    `\n- ${new Date(b[dateCol]).toLocaleDateString('uk-UA')} о ${b[timeCol]} (${formatParticipants(parseInt(b[participantsCol], 10))})`

                ).join('');

            }



            // Логика обновления основной таблицы "График"

            for (const record of recordsToCancel) {

                const dateToCancel = record[dateCol];

                const timeToCancel = record[timeCol];

                const participantsToCancel = parseInt(record[participantsCol], 10);



                const scheduleData = await getSheetData('График');

                const scheduleHeaders = scheduleData[0];

                const schDateCol = scheduleHeaders.indexOf('Дата');

                const schTimeCol = scheduleHeaders.indexOf('Час');

                const schBookedCol = scheduleHeaders.indexOf('Записано');



                let rowIndexToUpdate = scheduleData.findIndex((row, i) => i > 0 && new Date(row[schDateCol]).toISOString().split('T')[0] === dateToCancel && row[schTimeCol] === timeToCancel);



                if (rowIndexToUpdate !== -1) {

                    const currentBooked = parseInt(scheduleData[rowIndexToUpdate][schBookedCol], 10) || 0;

                    const newBookedValue = Math.max(0, currentBooked - participantsToCancel);

                    const cellRange = `${String.fromCharCode(65 + schBookedCol)}${rowIndexToUpdate + 1}`;

                    await updateSheetCell('График', cellRange, newBookedValue);

                }

            }

            await triggerAppsScriptUpdate();



            if (config.ADMIN_CHAT_ID) {

                const adminMessage = `❌ **Клієнт скасував запис**\n\n` +

                    `<b>Ім'я:</b> ${clientName}\n` +

                    `<b>Телефон:</b> ${phoneNumber}\n` +

                    `<b>ID:</b> ${clientChatIdToCancel}\n` +

                    `<b>Скасовані записи:</b>${bookingsDetails}`;



                await bot.sendMessage(config.ADMIN_CHAT_ID, adminMessage, { parse_mode: 'HTML' });

            }

        } catch (e) {

            console.error(`Помилка при скасуванні запису для ${chatId}: ${e.message}`);

            if (config.ADMIN_CHAT_ID) {

                await bot.sendMessage(config.ADMIN_CHAT_ID, `⚠️ Помилка автоматичного скасування запису для ${clientName}. Перевірте таблицю "График" вручну.`);

            }

        }

        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id });

        return;

    }

    if (data.startsWith('client_question_')) {

        const menuData = mainMenuCache.get('contacts');

        if (menuData) await sendMenu(chatId, menuData, query.from);

        return;

    }



    // ЗАМЕНИТЕ ВАШ СТАРЫЙ ОБРАБОТЧИК 'show_location' НА ЭТОТ

    // ЗАМЕНИТЕ ВАШ СТАРЫЙ БЛОК 'show_location' НА ЭТОТ

    // ЗАМЕНИТЕ ВАШ СТАРЫЙ ОБРАБОТЧИК 'show_location' НА ЭТОТ ФИНАЛЬНЫЙ ВАРИАНТ

    if (data === 'show_location') {

        // Находим в кэше раздел меню с ID 'location'

        const menuData = mainMenuCache.get('location');



        if (menuData) {

            // И просто отправляем его пользователю.

            // Ваша функция sendMenu сама отправит и карту, и текст, и кнопки из этого раздела.

            await sendMenu(chatId, menuData, query.from);

        } else {

            // Этот блок на случай, если раздел 'location' не будет найден в таблице "Меню"

            console.error("Не найден раздел меню с ID 'location'");

            await bot.sendMessage(chatId, "Вибачте, не вдалося знайти інформацію про локацію.");

        }

        return;

    }



    // ===================================================================

    // БЛОК 3: Основная логика для клиентов (запись, навигация)

    // ===================================================================



    if (data.startsWith('back_to_')) {

        let targetMenuId = data.replace('back_to_', '');

        userStates.set(chatId, { step: targetMenuId, data: {} });

        const menuData = mainMenuCache.get(targetMenuId);

        if (menuData) {

            await sendMenu(chatId, menuData, query.from, targetMenuId === 'main');

        }

        return;

    }



    if (data.startsWith('return_to_date_select_')) {

        const parts = data.split('_');

        if (parts.length >= 5) {

            const mkType = parts[3];

            const scheduleSheet = parts.slice(4).join('_');



            userStates.set(chatId, {

                step: 'await_date_selection',

                data: { mkType: mkType, scheduleSheet: scheduleSheet, callbackFromParent: `book_${mkType}` }

            });

            await sendAvailableDates(chatId, scheduleSheet, mkType);

        } else {

            console.error(`Некоректний формат callback_data для повернення до вибору дати: ${data}`);

            await bot.sendMessage(chatId, 'Не вдалося повернутися до вибору дати. Спробуйте знову через /start.');

            userStates.delete(chatId);

        }

        return;

    }



    let mkTypeForBooking = '';

    let scheduleSheetForBooking = '';

    let parentMenuIdForMoreInfo = '';



    if (data === 'start_kids_booking') {

        mkTypeForBooking = 'дитячий';

        scheduleSheetForBooking = config.SCHEDULE_SHEETS.KIDS;

        parentMenuIdForMoreInfo = 'mk_kids_mini';

    } else if (data === 'start_adult_booking') {

        mkTypeForBooking = 'дорослий';

        scheduleSheetForBooking = config.SCHEDULE_SHEETS.ADULT;

        parentMenuIdForMoreInfo = 'mk_adult_mini';

    } else if (data === 'start_individual_booking') {

        mkTypeForBooking = 'індивідуальний';

        scheduleSheetForBooking = config.SCHEDULE_SHEETS.INDIVIDUAL;

        parentMenuIdForMoreInfo = 'mk_individual';

    }



    if (mkTypeForBooking) {

        userStates.set(chatId, {

            step: 'await_date_selection',

            data: {

                mkType: mkTypeForBooking,

                scheduleSheet: scheduleSheetForBooking,

                callbackFromParent: data,

                showMoreInfoButton: true,

                moreInfoMenuId: parentMenuIdForMoreInfo

            }

        });

        await sendAvailableDates(chatId, scheduleSheetForBooking, mkTypeForBooking);

        return;

    }



    if (data === 'book_individual_large_group') {

        const mkType = 'індивідуальний';

        const scheduleSheet = config.SCHEDULE_SHEETS.INDIVIDUAL;

        userStates.set(chatId, {

            step: 'await_date_selection',

            data: {

                mkType: mkType,

                scheduleSheet: scheduleSheet,

                callbackFromParent: 'book_individual_mk',

                isLargeGroupBooking: true,

                showMoreInfoButton: true,

                moreInfoMenuId: 'mk_individual'

            }

        });

        await bot.sendMessage(chatId, '👥 Ви обрали запис для великої групи. Будь ласка, оберіть дату для індивідуального майстер-класу:');

        await sendAvailableDates(chatId, scheduleSheet, mkType);

        return;

    }



    if (mainMenuCache.has(data)) {

        userStates.set(chatId, { step: data, data: {} });

        const menuData = mainMenuCache.get(data);

        if (menuData) await sendMenu(chatId, menuData, query.from);

        return;

    }



    if (data.startsWith('book_') && !data.endsWith('_mk_back_to_date')) {

        let mkType = '';

        let scheduleSheet = '';

        if (data === 'book_kids_mk') {

            mkType = 'дитячий';

            scheduleSheet = config.SCHEDULE_SHEETS.KIDS;

        } else if (data === 'book_adult_mk') {

            mkType = 'дорослий';

            scheduleSheet = config.SCHEDULE_SHEETS.ADULT;

        } else if (data === 'book_individual_mk') {

            mkType = 'індивідуальний';

            scheduleSheet = config.SCHEDULE_SHEETS.INDIVIDUAL;

        }



        if (mkType) {

            userStates.set(chatId, {

                step: 'await_date_selection',

                data: { mkType: mkType, scheduleSheet: scheduleSheet, callbackFromParent: data, showMoreInfoButton: false }

            });

            await sendAvailableDates(chatId, scheduleSheet, mkType);

        }

        return;

    }



    if (data.startsWith('select_date_')) {

        const selectedDate = data.replace('select_date_', '');

        currentState.data.selectedDate = selectedDate;

        userStates.set(chatId, { ...currentState, step: 'await_time_selection' });

        await sendAvailableTimes(chatId, currentState.data.scheduleSheet, selectedDate, currentState.data.mkType);

        return;

    }



    if (data.startsWith('select_time_')) {

        const selectedTime = data.replace('select_time_', '');

        currentState.data.selectedTime = selectedTime;



        const userTelegramId = query.from.id;

        const savedUserData = await getUserDataFromSheet(userTelegramId);

        currentState.data.savedUserData = savedUserData;



        currentState.data.userTelegramData = {

            id: userTelegramId,

            username: query.from.username || '',

            first_name: query.from.first_name || '',

            last_name: query.from.last_name || ''

        };



        if (savedUserData && savedUserData.phone_number && savedUserData.first_name) {

            currentState.data.phoneNumber = savedUserData.phone_number;

            currentState.data.userName = savedUserData.first_name;

            userStates.set(chatId, { ...currentState, step: 'await_participants_input' });



            const bookMkMenu = mainMenuCache.get('book_mk');

            const participantsRequestMessage = bookMkMenu.find(item => item['ТЕКСТ/НАЗВАНИЕ'].includes('Скільки учасників') && item['ТИП_ЭЛЕМЕНТА'] === 'message');

            if (participantsRequestMessage) await bot.sendMessage(chatId, participantsRequestMessage['ТЕКСТ/НАЗВАНИЕ'], { parse_mode: 'HTML' });

        } else {

            let messageText = '📱 Щоб ми могли з вами зв\'язатись, надішліть, будь ласка, номер телефону, натиснувши кнопку "Поділитись контактом" нижче.\n\n';

            messageText += 'Або введіть номер телефону вручну (наприклад, 0XXYYYYZZZZ):';

            const bookMkMenu = mainMenuCache.get('book_mk');

            const contactButtonItem = bookMkMenu.find(item => item['ТИП_ЭЛЕМЕНТА'] === 'contact_btn');

            const keyboard = contactButtonItem ? [[{ text: contactButtonItem['ТЕКСТ/НАЗВАНИЕ'], request_contact: true }]] : [];

            await bot.sendMessage(chatId, messageText, {

                reply_markup: { keyboard: keyboard, resize_keyboard: true, one_time_keyboard: true },

                parse_mode: 'HTML'

            });

            userStates.set(chatId, { ...currentState, step: 'await_phone_number' });

        }

        return;

    }



    if (data.startsWith('book_') && data.endsWith('_mk_back_to_date')) {

        const currentState = userStates.get(chatId);

        if (currentState && currentState.data && currentState.data.mkType) {

            userStates.set(chatId, { ...currentState, step: 'await_date_selection' });

            await sendAvailableDates(chatId, currentState.data.scheduleSheet, currentState.data.mkType);

        } else {

            await bot.sendMessage(chatId, 'Не вдалося повернутися до вибору дати. Спробуйте знову через /start.');

            userStates.delete(chatId);

        }

        return;

    }



    if (data === 'go_to_master_chat') {

        const goMasterChatMenu = mainMenuCache.get('go_to_master_chat');

        if (goMasterChatMenu) {

            const user = query.from;

            let interestedMkId = currentState.step;

            let foundMkName = 'Невідомий МК';

            const possibleParents = ['mk_clay_therapy', 'mk_photosession_combo', 'coworking', 'go_to_prise_coworking', 'mobile_mk'];

            for (const parentId of possibleParents) {

                const parentMenuItems = mainMenuCache.get(parentId);

                if (parentMenuItems) {

                    const hasRelevantButton = parentMenuItems.some(item =>

                        (item['CALLBACK_DATA (для кнопок)'] === 'go_to_master_chat') ||

                        (item['CALLBACK_DATA (для кнопок)'] && (item['CALLBACK_DATA (для кнопок)'].startsWith('https://t.me/') && item['ТЕКСТ/НАЗВАНИЕ'].includes('Погодити ціну')))

                    );

                    if (interestedMkId === parentId || hasRelevantButton) {

                        const firstTextMessage = parentMenuItems.find(item => item['ТИП_ЭЛЕМЕНТА'] === 'message');

                        if (firstTextMessage && firstTextMessage['ТЕКСТ/НАЗВАНИЕ']) {

                            foundMkName = firstTextMessage['ТЕКСТ/НАЗВАНИЕ'].split('\n')[0].replace(/<\/?b>/g, '');

                            break;

                        }

                    }

                }

            }



            await appendOrUpdateSheetRow(config.INTERESTED_MK_SHEET_NAME, [

                new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),

                user.id, user.username || '', user.first_name || '', user.last_name || '', '',

                foundMkName, '', '', '', 'Зацікавлений'

            ]);

            console.log(`Зафіксовано зацікавленість у МК "${foundMkName}" від користувача ${user.username || user.id}`);

            await sendMenu(chatId, goMasterChatMenu, user);

        }

        return;

    }

});



// Обработчик контактов

bot.on('contact', async (msg) => {

    const chatId = msg.chat.id;

    const contact = msg.contact;

    const currentState = userStates.get(chatId);



    if (!currentState) {

        await bot.sendMessage(chatId, 'Дякуємо! Щоб розпочати, скористайтеся командой /start.');

        return;

    }



    const userTelegramData = currentState.data.userTelegramData || {

        id: msg.from.id, username: msg.from.username || '',

        first_name: msg.from.first_name || '', last_name: msg.from.last_name || ''

    };



    if (currentState.step === 'await_phone_number') {

        currentState.data.phoneNumber = contact.phone_number;

        userStates.set(chatId, { ...currentState, step: 'await_name_input' });



        await updateUserInfoInSheet(userTelegramData.id, userTelegramData.username, userTelegramData.first_name, userTelegramData.last_name, currentState.data.phoneNumber);



        const bookMkMenu = mainMenuCache.get('book_mk');

        const nameRequestMessage = bookMkMenu.find(item => item['ТЕКСТ/НАЗВАНИЕ'].includes('ваше ім\'я') && item['ТИП_ЭЛЕМЕНТА'] === 'message');

        if (nameRequestMessage) {

            await bot.sendMessage(chatId, nameRequestMessage['ТЕКСТ/НАЗВАНИЕ'], { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });

        }

    } else {

        await bot.sendMessage(chatId, 'Дякуємо! Щоб розпочати, скористайтеся командой /start.');

    }

});





// Обработчик текстовых сообщений

bot.on('message', async (msg) => {

    const chatId = msg.chat.id;

    const text = msg.text;



    // Игнорируем команды и контакты, они обрабатываются в других местах

    if (!text || text.startsWith('/') || msg.contact) {

        return;

    }



    const currentState = userStates.get(chatId);

    if (!currentState) {

        const mainMenu = mainMenuCache.get('main');

        if (mainMenu) await sendMenu(chatId, mainMenu, msg.from, true);

        return;

    }



    console.log(`[message] User: ${chatId}, Step: "${currentState.step}", Text: "${text}"`);



    // --- НОВЫЙ БЛОК: Обработка ввода админа ---

    if (isAdmin(chatId) && currentState.step.startsWith('admin_await_')) {

        const numParticipantsInput = parseInt(text, 10);

        if (isNaN(numParticipantsInput) || numParticipantsInput <= 0) {

            await bot.sendMessage(chatId, 'Будь ласка, введіть коректне число більше нуля.');

            return;

        }



        const { rowNum } = currentState.data;

        const actionType = currentState.step.includes('record') ? 'record' : 'cancel';



        try {

            const scheduleData = await getSheetData(config.SCHEDULE_SHEETS.GENERAL);

            const headers = scheduleData[0];

            const bookedColIndex = headers.indexOf('Записано');



            if (bookedColIndex === -1) {

                await bot.sendMessage(chatId, 'Помилка: не знайдено колонку "Записано" в таблиці.');

                userStates.delete(chatId);

                return;

            }



            const rowToUpdate = scheduleData[rowNum - 1];

            const currentBooked = parseInt(rowToUpdate[bookedColIndex], 10) || 0;



            let newBookedValue;

            if (actionType === 'record') {

                newBookedValue = currentBooked + numParticipantsInput;

            } else { // cancel

                newBookedValue = Math.max(0, currentBooked - numParticipantsInput);

            }



            const cellRange = `${String.fromCharCode(65 + bookedColIndex)}${rowNum}`;

            await updateSheetCell(config.SCHEDULE_SHEETS.GENERAL, cellRange, newBookedValue);



            const scriptResult = await triggerAppsScriptUpdate();

            if (!scriptResult.success) {

                console.error('Не вдалося викликати Google Apps Script Web App:', scriptResult.error);

                await bot.sendMessage(chatId, 'Помилка під час запуску скрипта оновлення таблиці.');

            }



            const successMessage = actionType === 'record'

                ? `✅ Успішно записано ${formatParticipants(numParticipantsInput)}. Нова кількість: ${newBookedValue}.`

                : `✅ Запис для ${formatParticipants(numParticipantsInput)} скасовано. Нова кількість: ${newBookedValue}.`;



            await bot.sendMessage(chatId, successMessage);

            userStates.delete(chatId);



            const inline_keyboard = [

                [{ text: '✍️ Записати ще', callback_data: 'admin_start_record' }],

                [{ text: '❌ Скасувати ще', callback_data: 'admin_start_cancel' }],

                [{ text: '🔙 Головне меню', callback_data: 'back_to_main' }]

            ];

            await bot.sendMessage(chatId, 'Оберіть наступну дію:', { reply_markup: { inline_keyboard } });



        } catch (error) {

            console.error(`[Admin Error] Ошибка при обновлении записи для строки ${rowNum}:`, error);

            await bot.sendMessage(chatId, 'Сталася критична помилка під час оновлення даних в таблиці.');

            userStates.delete(chatId);

        }

        return; // Завершаем обработку для админа

    }

    // --- КОНЕЦ АДМИН-БЛОКА ---



    // --- Логика для клиентов ---

    const user = msg.from;



    if (currentState.step === 'await_phone_number') {

        const phoneRegex = /^(0(39|50|63|66|67|68|73|89|91|92|93|94|95|96|97|98|99)\d{7})$/;

        const cleanInput = text.replace(/[^\d]/g, '');



        if (phoneRegex.test(cleanInput)) {

            currentState.data.phoneNumber = cleanInput;

            userStates.set(chatId, { ...currentState, step: 'await_name_input' });



            const userTelegramData = currentState.data.userTelegramData || {

                id: msg.from.id, username: msg.from.username || '',

                first_name: msg.from.first_name || '', last_name: msg.from.last_name || ''

            };

            await updateUserInfoInSheet(userTelegramData.id, userTelegramData.username, userTelegramData.first_name, userTelegramData.last_name, currentState.data.phoneNumber);



            const bookMkMenu = mainMenuCache.get('book_mk');

            const nameRequestMessage = bookMkMenu.find(item => item['ТЕКСТ/НАЗВАНИЕ'].includes('ваше ім\'я'));

            if (nameRequestMessage) {

                await bot.sendMessage(chatId, nameRequestMessage['ТЕКСТ/НАЗВАНИЕ'], { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });

            }

        } else {

            await bot.sendMessage(chatId, 'Будь ласка, введіть коректний номер телефону у форматі 0ХХХХХХХХХ.');

        }

    } else if (currentState.step === 'await_name_input') {

        currentState.data.userName = text;

        userStates.set(chatId, { ...currentState, step: 'await_participants_input' });



        const userTelegramData = currentState.data.userTelegramData || {

            id: msg.from.id, username: msg.from.username || '',

            first_name: currentState.data.userName, last_name: msg.from.last_name || ''

        };

        await updateUserInfoInSheet(userTelegramData.id, userTelegramData.username, userTelegramData.first_name, userTelegramData.last_name, currentState.data.phoneNumber);



        const bookMkMenu = mainMenuCache.get('book_mk');

        const participantsRequestMessage = bookMkMenu.find(item => item['ТЕКСТ/НАЗВАНИЕ'].includes('Скільки учасників'));

        if (participantsRequestMessage) {

            await bot.sendMessage(chatId, participantsRequestMessage['ТЕКСТ/НАЗВАНИЕ'], { parse_mode: 'HTML' });

        }

    } else if (currentState.step === 'await_participants_input') {

        const numParticipants = parseInt(text, 10);

        if (isNaN(numParticipants) || numParticipants <= 0) {

            await bot.sendMessage(chatId, 'Будь ласка, введіть дійсне число учасників.');

            return;

        }

        currentState.data.numParticipants = numParticipants;

        userStates.set(chatId, { ...currentState, step: 'booking_complete' });



        const { mkType, selectedDate, selectedTime, userName, phoneNumber } = currentState.data;



        try {

            const generalScheduleData = await getSheetData(config.SCHEDULE_SHEETS.GENERAL);

            if (generalScheduleData.length === 0) {

                await bot.sendMessage(chatId, 'Сталася помилка при отриманні даних графіку.');

                userStates.delete(chatId);

                return;

            }



            const headers = generalScheduleData[0];

            const dateColIndex = headers.indexOf('Дата');

            const timeColIndex = headers.indexOf('Час');

            const typeColIndex = headers.indexOf('Тип МК');

            const bookedColIndex = headers.indexOf('Записано');

            const maxColIndex = headers.indexOf('Макс. учасників');



            if ([dateColIndex, timeColIndex, typeColIndex, bookedColIndex, maxColIndex].includes(-1)) {

                console.error(`Не найдены необходимые заголовки в листе "${config.SCHEDULE_SHEETS.GENERAL}".`);

                await bot.sendMessage(chatId, 'Вибачте, сталася внутрішня помилка. Зверніться до адміністратора.');

                userStates.delete(chatId);

                return;

            }



            let rowIndexToUpdate = -1;

            let currentBooked = 0;

            let maxParticipants = Infinity;



            for (let i = 1; i < generalScheduleData.length; i++) {

                const row = generalScheduleData[i];

                if (new Date(row[dateColIndex]).toISOString().split('T')[0] === selectedDate && row[timeColIndex] === selectedTime && row[typeColIndex] === mkType) {

                    rowIndexToUpdate = i;

                    currentBooked = parseInt(row[bookedColIndex], 10) || 0;

                    maxParticipants = parseInt(row[maxColIndex], 10) || Infinity;

                    break;

                }

            }



            const clientNameForMsg = userName || user.first_name || 'Клієнт';

            const clientPhone = phoneNumber || 'Не надано';

            const clientUsername = user.username ? `@${user.username}` : '(юзернейм не вказано)';

            const mkFullName = getMkFullName(mkType);

            const formattedDate = formatDateForMessage(selectedDate);

            const participantsText = formatParticipants(numParticipants);



            const successHeader = `Повідомлення для клієнта ${clientUsername}:`;

            const successBody = `<code>${clientNameForMsg}, вітаю!☺️\n` +

                `Ви забронювали віконце на МК ${mkFullName}, "${formattedDate} ${selectedTime}" (${participantsText})\n` +

                `Записали вас на цю дату і час, очікуємо вас на МК☺️\n` +

                `Додатково за добу напишемо вам, щоб підтвердити запис.\n` +

                `Якщо залишились питання – пишіть ❤️</code>`;



            const failureHeader = `Або`;

            const failureBody = `<code>${clientNameForMsg}, вітаю!☺️\n` +

                `Ви забронювали віконце на МК ${mkFullName}, "${formattedDate} ${selectedTime}" (${participantsText})\n` +

                `Нажаль, це віконце вже зайняте. Можемо запропонувати вам МК ... о ...\n` +

                `Чи буде вам зручно завітати до нас у цей день та час?</code>`;



            const adminInfo = `Нове бронювання: Клієнт: ${clientNameForMsg}, Телефон: ${clientPhone}, МК: ${mkFullName}, ${formattedDate} ${selectedTime}, Кількість людей: ${participantsText}`;

            const adminMessage = `${adminInfo}\n\n${successHeader}\n${successBody}\n\n${failureHeader}\n${failureBody}`;



            if (rowIndexToUpdate !== -1) {

                if (config.ADMIN_CHAT_ID) {

                    await bot.sendMessage(config.ADMIN_CHAT_ID, adminMessage, { parse_mode: 'HTML' });

                } else {

                    console.warn("ADMIN_CHAT_ID не вказано в конфігурації. Повідомлення адміну не відправлено.")

                }



                if (currentBooked + numParticipants > maxParticipants) {

                    await bot.sendMessage(chatId, `На жаль, на цей майстер-клас доступно лише ${maxParticipants - currentBooked} місць. Ви запросили ${numParticipants}.`);

                    await bot.sendMessage(chatId, `Будь ласка, спробуйте іншу дату або час:`);

                    await sendAvailableDates(chatId, currentState.data.scheduleSheet, currentState.data.mkType);

                    userStates.set(chatId, { ...currentState, step: 'await_date_selection' });

                    return;

                }



                const newBookedValue = currentBooked + numParticipants;

                const cellRange = `${String.fromCharCode(65 + bookedColIndex)}${rowIndexToUpdate + 1}`;

                await updateSheetCell(config.SCHEDULE_SHEETS.GENERAL, cellRange, newBookedValue);



                const scriptResult = await triggerAppsScriptUpdate();

                if (!scriptResult.success) {

                    console.error('Не вдалося викликати Google Apps Script Web App:', scriptResult.error);

                }



                const bookingCompleteMessage = mainMenuCache.get('book_mk').find(item => item['ТЕКСТ/НАЗВАНИЕ'].includes('Дякую, ви записані'));

                if (bookingCompleteMessage) {

                    const finalMessage = bookingCompleteMessage['ТЕКСТ/НАЗВАНИЕ']

                        .replace('Майстер-класс ...', `Майстер-клас ${mkType}`)

                        .replace('... числа, о ...', `${new Date(selectedDate).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' })} числа, о ${selectedTime}`);

                    await bot.sendMessage(chatId, finalMessage, { parse_mode: 'HTML' });

                }



                await appendOrUpdateSheetRow(config.INTERESTED_MK_SHEET_NAME, [

                    new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),

                    user.id, user.username || '', userName || user.first_name || '',

                    user.last_name || '', phoneNumber || '', mkType,

                    selectedDate, selectedTime, numParticipants, 'Записано'

                ]);



                userStates.set(chatId, { step: 'main', data: {} });

                const mainMenu = mainMenuCache.get('main');

                if (mainMenu) {

                    await sendMenu(chatId, mainMenu, msg.from, true);

                } else {

                    await bot.sendMessage(chatId, 'Сталася помилка при завантаженні головного меню. /start');

                }



            } else {

                await bot.sendMessage(chatId, '😔 Вибачте, не вдалося знайти вибраний вами час. Можливо, він вже зайнятий.');

                userStates.set(chatId, { ...currentState, step: 'await_date_selection' });

            }



        } catch (error) {

            console.error('[await_participants_input] Критическая ошибка в процессе бронирования:', error.message, error.stack);

            await bot.sendMessage(chatId, 'Сталася помилка при бронюванні. Будь ласка, спробуйте ще раз або зв’яжіться з адміністратором.');

            userStates.delete(chatId);

        }

    } else {

        await bot.sendMessage(chatId, 'Вибачте, я не зрозумів ваше повідомлення. Будь ласка, скористайтеся кнопками або розпочніть знову командой /start.');

    }

});

/**

 * Отправляет календарь доступных дат для бронирования.

 */

/**

 * Отправляет календарь доступных дат для бронирования.

 */

/**

 * Отправляет календарь доступных дат для бронирования.

 */

async function sendAvailableDates(chatId, scheduleSheetName, mkType) {

    try {

        const inlineKeyboard = [];

        const scheduleData = await getSheetData(config.SCHEDULE_SHEETS.GENERAL);

        if (scheduleData.length < 2) {

            await bot.sendMessage(chatId, '😟 Вибачте, сталася помилка при завантаженні доступних дат.');

            userStates.delete(chatId);

            return;

        }



        const headers = scheduleData[0];

        const dateCol = headers.indexOf('Дата');

        const statusCol = headers.indexOf('Віконце');

        const typeCol = headers.indexOf('Тип МК');

        const bookedCol = headers.indexOf('Записано');

        const maxCol = headers.indexOf('Макс. учасників');



        if ([dateCol, statusCol, typeCol, bookedCol, maxCol].includes(-1)) {

            console.error(`Не найдены необходимые заголовки на листе "${config.SCHEDULE_SHEETS.GENERAL}".`);

            await bot.sendMessage(chatId, 'Вибачте, сталася внутрішня помилка. Зверніться до адміністратора.');

            userStates.delete(chatId);

            return;

        }



        const availableDates = new Set();

        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));

        now.setHours(0, 0, 0, 0);



        for (let i = 1; i < scheduleData.length; i++) {

            const row = scheduleData[i];

            const dateStr = String(row[dateCol] || '').trim();

            if (!dateStr) continue;



            try {

                const eventDate = new Date(dateStr);

                if (isNaN(eventDate.getTime())) continue;

                eventDate.setHours(0, 0, 0, 0);



                const status = String(row[statusCol] || '').trim();

                const rowMkType = String(row[typeCol] || '').trim();

                const currentBooked = parseInt(row[bookedCol], 10) || 0;



                // --- ИСПРАВЛЕНИЕ ЗДЕСЬ: Разная логика доступности ---

                let isSlotAvailable;

                if (rowMkType === 'індивідуальний') {

                    // Индивидуальный МК доступен, только если никто не записан

                    isSlotAvailable = currentBooked === 0;

                } else {

                    // Групповой МК доступен, если есть свободные места

                    const maxParticipants = parseInt(row[maxCol], 10) || 0; // Если макс. не указано, считаем 0, т.е. закрыто

                    isSlotAvailable = currentBooked < maxParticipants;

                }



                if (eventDate >= now && status === 'Доступне' && rowMkType === mkType && isSlotAvailable) {

                    availableDates.add(dateStr);

                }

            } catch (e) {

                console.warn(`Некоректна дата в рядку ${i + 1}: ${dateStr}`);

            }

        }



        if (availableDates.size === 0) {

            await bot.sendMessage(chatId, '😟 Вибачте, наразі немає доступних дат для цього майстер-класу.');

            return;

        }



        const sortedDates = Array.from(availableDates).sort((a, b) => new Date(a) - new Date(b));

        const buttonsPerRow = 3;

        let currentRow = [];



        for (const date of sortedDates) {

            const formattedDate = new Date(date).toLocaleDateString('uk-UA', {

                timeZone: 'Europe/Kyiv',

                weekday: 'short', day: '2-digit', month: '2-digit'

            });

            currentRow.push({ text: formattedDate, callback_data: `select_date_${date}` });

            if (currentRow.length === buttonsPerRow) {

                inlineKeyboard.push(currentRow);

                currentRow = [];

            }

        }

        if (currentRow.length > 0) {

            inlineKeyboard.push(currentRow);

        }



        const currentUserState = userStates.get(chatId);

        if (currentUserState && currentUserState.data.showMoreInfoButton && currentUserState.data.moreInfoMenuId) {

            inlineKeyboard.push([{ text: 'ℹ️ Дізнатись більше про МК', callback_data: currentUserState.data.moreInfoMenuId }]);

        }



        let backCallbackData = 'back_to_main';

        if (mkType === 'дитячий') backCallbackData = 'back_to_mk_kids_mini';

        else if (mkType === 'дорослий') backCallbackData = 'back_to_mk_adult_mini';

        else if (mkType === 'індивідуальний') backCallbackData = 'mk_individual';



        inlineKeyboard.push([{ text: '🔙 В попереднє меню', callback_data: backCallbackData }]);



        let mkTypeGenitive = 'майстер-класу';

        if (mkType === 'дитячий') mkTypeGenitive = 'дитячого майстер-класу';

        else if (mkType === 'дорослий') mkTypeGenitive = 'дорослого майстер-класу';

        else if (mkType === 'індивідуальний') mkTypeGenitive = 'індивідуального майстер-класу';



        await bot.sendMessage(chatId, `Виберіть дату для ${mkTypeGenitive}:`, {

            reply_markup: { inline_keyboard: inlineKeyboard }

        });



    } catch (error) {

        console.error(`Помилка при отриманні дат для "${scheduleSheetName}":`, error.message, error.stack);

        await bot.sendMessage(chatId, 'Сталася помилка при отриданні доступних дат.');

    }

}

/**

 * Отправляет кнопки с доступными часами для выбранной даты.

 */

/**

 * Отправляет кнопки с доступными часами для выбранной даты.

 */

/**

 * Отправляет кнопки с доступными часами для выбранной даты.

 */

/**

 * Отправляет кнопки с доступными часами для выбранной даты.

 */

async function sendAvailableTimes(chatId, scheduleSheetName, selectedDate, mkType) {

    try {

        const inlineKeyboard = [];



        const scheduleData = await getSheetData(config.SCHEDULE_SHEETS.GENERAL);

        if (scheduleData.length < 2) {

            await bot.sendMessage(chatId, 'Не вдалося завантажити дані розкладу.');

            return;

        }



        const headers = scheduleData[0];

        const dateCol = headers.indexOf('Дата');

        const timeCol = headers.indexOf('Час');

        const statusCol = headers.indexOf('Віконце');

        const notesCol = headers.indexOf('*Примітки');

        const typeCol = headers.indexOf('Тип МК');

        const bookedCol = headers.indexOf('Записано');

        const maxCol = headers.indexOf('Макс. учасників');



        if ([dateCol, timeCol, statusCol, typeCol, bookedCol, maxCol].includes(-1)) {

            await bot.sendMessage(chatId, 'Вибачте, сталася внутрішня помилка конфігурації таблиці.');

            userStates.delete(chatId);

            return;

        }



        const availableTimes = [];

        for (let i = 1; i < scheduleData.length; i++) {

            const row = scheduleData[i];

            const date = row[dateCol];

            if (new Date(date).toISOString().split('T')[0] === selectedDate && row[statusCol] === 'Доступне' && row[typeCol] === mkType) {

                const booked = parseInt(row[bookedCol] || 0, 10);



                // --- ИСПРАВЛЕНИЕ ЗДЕСЬ: Разная логика доступности ---

                let isSlotAvailable;

                if (mkType === 'індивідуальний') {

                    isSlotAvailable = booked === 0;

                } else {

                    const max = parseInt(row[maxCol], 10) || 0;

                    isSlotAvailable = booked < max;

                }



                if (isSlotAvailable) {

                    availableTimes.push({

                        time: row[timeCol],

                        notes: row[notesCol] || '',

                        booked: booked,

                        max: parseInt(row[maxCol], 10) || Infinity

                    });

                }

            }

        }



        if (availableTimes.length === 0) {

            await bot.sendMessage(chatId, `На жаль, на ${new Date(selectedDate).toLocaleDateString('uk-UA')} всі місця вже зайняті або немає доступних годин.`);

            await sendAvailableDates(chatId, scheduleSheetName, mkType);

            return;

        }



        availableTimes.sort((a, b) => a.time.localeCompare(b.time));



        for (const slot of availableTimes) {

            let buttonText = slot.time;

            // Для индивидуального МК больше не показываем кол-во мест, т.к. он либо есть, либо его нет

            if (mkType !== 'індивідуальний') {

                const availableCount = Math.max(0, slot.max - slot.booked);

                buttonText += ` (вільно ${availableCount})`;

            }

            inlineKeyboard.push([{ text: buttonText, callback_data: `select_time_${slot.time}` }]);



            if (slot.notes) {

                await bot.sendMessage(chatId, slot.notes, { parse_mode: 'HTML' });

            }

        }



        const navRow = [];

        if (mkType !== 'індивідуальний') {

            navRow.push({ text: '👥 Більше 5 людей', callback_data: 'book_individual_large_group' });

        }



        let backToDateCallback;

        if (mkType === 'дитячий') backToDateCallback = 'book_kids_mk';

        else if (mkType === 'дорослий') backToDateCallback = 'book_adult_mk';

        else if (mkType === 'індивідуальний') backToDateCallback = 'book_individual_mk';

        else backToDateCallback = 'back_to_mk_classes';



        navRow.push({ text: '🔙 До вибору дати', callback_data: backToDateCallback });

        inlineKeyboard.push(navRow);



        let mkTypeGenitive = 'майстер-класу';

        if (mkType === 'дитячий') mkTypeGenitive = 'дитячого майстер-класу';

        else if (mkType === 'дорослий') mkTypeGenitive = 'дорослого майстер-класу';

        else if (mkType === 'індивідуальний') mkTypeGenitive = 'індивідуального майстер-класу';



        await bot.sendMessage(chatId, `Виберіть час на ${new Date(selectedDate).toLocaleDateString('uk-UA')} для ${mkTypeGenitive}:`, {

            reply_markup: { inline_keyboard: inlineKeyboard }

        });



    } catch (error) {

        console.error(`Помилка при отриманні часу для "${scheduleSheetName}" на ${selectedDate}:`, error.message, error.stack);

        await bot.sendMessage(chatId, 'Сталася помилка при отриданні доступних годин.');

    }

}



// Запуск бота

// --- ПОЧАТОК ЗАПУСКУ СЕРВЕРА (app.listen) ---
app.listen(PORT, async () => {
    console.log(`Сервер слухає на порту ${PORT}`);
    try {
        // Встановлюємо вебхук у Telegram. Це потрібно зробити ОДИН РАЗ при запуску/деплої.
        const success = await bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);
        if (success) {
            console.log('Вебхук успішно встановлено:', `${WEBHOOK_URL}/bot${TOKEN}`);
        } else {
            console.error('Не вдалося встановити вебхук.');
        }
    } catch (error) {
        console.error('Помилка при встановленні вебхука:', error.message);
    }

    // --- ВАШ ІСНУЮЧИЙ КОД ІНІЦІАЛІЗАЦІЇ БОТА ПЕРЕМІЩАЄТЬСЯ СЮДИ ---
    console.log('Бот запускається...'); // Це повідомлення тепер тут
    initializeGoogleSheets().then(() => {
        console.log('Google Sheets API успішно ініціалізовано!');
        console.log('Бот запущений та підключений до Google Sheets API.');
        setBotCommands();
        loadMenuData();
        console.log('Дані меню успішно завантажено та кешовано.');
    }).catch(err => {
        console.error('Помилка при запуску бота та підключенні до Google Sheets API:', err);
        process.exit(1);
    });
    // --- КІНЕЦЬ ІСНУЮЧОГО КОДУ ІНІЦІАЛІЗАЦІЇ БОТА ---

    console.log('Бот запущен і готовий приймати оновлення через вебхук.');
});
// --- КІНЕЦЬ ЗАПУСКУ СЕРВЕРА ---