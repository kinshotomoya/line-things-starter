
// User service UUID: Change this to your generated service UUID
const USER_SERVICE_UUID = '180ceb9c-07a3-4f06-95e7-7927579f2c7c'; // LED, Button
// User service characteristics
const LED_CHARACTERISTIC_UUID = 'E9062E71-9E62-4BC6-B0D3-35CDCD9B027B';
const BTN_CHARACTERISTIC_UUID = '62FBD229-6EDD-4D1A-B554-5C4E1BB29169';
const NOTIFY_LED_BUTTON_CLICK_CHARACTERISTIC_UUID = '839ff311-21a1-4114-adc0-543477dc7389';

// PSDI Service UUID: Fixed value for Developer Trial
const PSDI_SERVICE_UUID = 'e625601e-9e55-4597-a598-76018a0d293d'; // Device ID
const PSDI_CHARACTERISTIC_UUID = '26E2B12B-85F0-4F3F-9FDD-91D114270E6E';

// const READ_SERVICE_UUID = 'af930343-cc42-4b47-80e3-b47a6b585d26';

// UI settings
let ledState = false; // true: LED on, false: LED off
let clickCount = 0;


// -------------- //
// On window load //
// -------------- //

window.onload = () => {
    initializeApp();
};

// ----------------- //
// Handler functions //
// ----------------- //

function handlerToggleLed() {
    ledState = !ledState;

    uiToggleLedButton(ledState);
    liffToggleDeviceLedState(ledState);
}

// ------------ //
// UI functions //
// ------------ //

function uiToggleLedButton(state) {
    const el = document.getElementById("btn-led-toggle");
    el.innerText = state ? "Switch LED OFF" : "Switch LED ON";

    if (state) {
        el.classList.add("led-on");
    } else {
        el.classList.remove("led-on");
    }
}

function uiCountPressButton() {
    clickCount++;

    const el = document.getElementById("click-count");
    el.innerText = clickCount;
}

function uiToggleStateButton(pressed) {
    const el = document.getElementById("btn-state");

    if (pressed) {
        el.classList.add("pressed");
        el.innerText = "Pressed";
    } else {
        el.classList.remove("pressed");
        el.innerText = "Released";
    }
}

function uiToggleDeviceConnected(connected) {
    const elStatus = document.getElementById("status");
    const elControls = document.getElementById("controls");

    elStatus.classList.remove("error");

    if (connected) {
        // Hide loading animation
        uiToggleLoadingAnimation(false);
        // Show status connected
        elStatus.classList.remove("inactive");
        elStatus.classList.add("success");
        elStatus.innerText = "Device connected";
        // Show controls
        // BELデバイスと接続できた場合のみ、hiddenを外してviewを表示させる
        elControls.classList.remove("hidden");
    } else {
        // Show loading animation
        uiToggleLoadingAnimation(true);
        // Show status disconnected
        elStatus.classList.remove("success");
        elStatus.classList.add("inactive");
        elStatus.innerText = "Device disconnected";
        // Hide controls
        elControls.classList.add("hidden");
    }
}

function uiToggleLoadingAnimation(isLoading) {
    const elLoading = document.getElementById("loading-animation");

    if (isLoading) {
        // Show loading animation
        elLoading.classList.remove("hidden");
    } else {
        // Hide loading animation
        elLoading.classList.add("hidden");
    }
}

function uiStatusError(message, showLoadingAnimation) {
    uiToggleLoadingAnimation(showLoadingAnimation);

    const elStatus = document.getElementById("status");
    const elControls = document.getElementById("controls");

    // Show status error
    elStatus.classList.remove("success");
    elStatus.classList.remove("inactive");
    elStatus.classList.add("error");
    elStatus.innerText = message;

    // Hide controls
    elControls.classList.add("hidden");
}

function makeErrorMsg(errorObj) {
    return "Error\n" + errorObj.code + "\n" + errorObj.message;
}

// -------------- //
// LIFF functions //
// -------------- //

function initializeApp() {
    liff.init(() => initializeLiff(), error => uiStatusError(makeErrorMsg(error), false));
}

function initializeLiff() {
    liff.initPlugins(['bluetooth']).then(() => {
        liffCheckAvailablityAndDo(() => liffRequestDevice());
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffCheckAvailablityAndDo(callbackIfAvailable) {
    // Check Bluetooth availability
    liff.bluetooth.getAvailability().then(isAvailable => {
        if (isAvailable) {
            uiToggleDeviceConnected(false);
            callbackIfAvailable();
        } else {
            uiStatusError("Bluetooth not available", true);
            setTimeout(() => liffCheckAvailablityAndDo(callbackIfAvailable), 10000);
        }
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });;
}

function liffRequestDevice() {
    liff.bluetooth.requestDevice().then(device => {
        liffConnectToDevice(device);
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffConnectToDevice(device) {
    device.gatt.connect().then(() => {
        document.getElementById("device-name").innerText = device.name;
        document.getElementById("device-id").innerText = device.id;

        // Show status connected
        uiToggleDeviceConnected(true);

        // Get service
        device.gatt.getPrimaryService(USER_SERVICE_UUID).then(service => {
            liffGetUserService(service);
        }).catch(error => {
            uiStatusError(makeErrorMsg(error), false);
        });
        device.gatt.getPrimaryService(PSDI_SERVICE_UUID).then(service => {
            liffGetPSDIService(service);
        }).catch(error => {
            uiStatusError(makeErrorMsg(error), false);
        });

        // Device disconnect callback
        const disconnectCallback = () => {
            // Show status disconnected
            uiToggleDeviceConnected(false);

            // Remove disconnect callback
            device.removeEventListener('gattserverdisconnected', disconnectCallback);

            // Reset LED state
            ledState = false;
            // Reset UI elements
            uiToggleLedButton(false);
            uiToggleStateButton(false);

            // Try to reconnect
            initializeLiff();
        };

        device.addEventListener('gattserverdisconnected', disconnectCallback);
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffGetUserService(service) {
    // Button pressed state
    service.getCharacteristic(BTN_CHARACTERISTIC_UUID).then(characteristic => {
        liffGetButtonStateCharacteristic(characteristic);
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });

    // Toggle LED
    service.getCharacteristic(LED_CHARACTERISTIC_UUID).then(characteristic => {
        window.ledCharacteristic = characteristic;

        // Switch off by default
        liffToggleDeviceLedState(false);
        // 暑い、寒い、臭いなどのユーザー票データを、GASのwebサーバから取得して、
        // デバイスに通知する
        // TODO:
        liffGetAndWriteUserOpinionToDevice();
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });

    // service.getCharacteristic(NOTIFY_LED_BUTTON_CLICK_CHARACTERISTIC_UUID).then(characteristic => {
    //     // window.alert('led buttonです。');
    //     liffGetLedButtonClickCount(characteristic);
    // }).catch(error => {
    //     window.alert("Error");
    // })

    // readCharactericのデータを読みに行く処理
    // service.getCharacteristic(READ_SERVICE_UUID).then(characteristic => {
    //     return characteristic.readValue();
    // }).then(value => {
    //     const value = new DataView(value.buffer).getInt32(0, true);
    //     document.getElementById("total-count").innerText = value;
    // }).catch(error => {
    //     uiStatusError(makeErrorMsg(error), false);
    // });
}

function liffGetPSDIService(service) {
    // Get PSDI value
    service.getCharacteristic(PSDI_CHARACTERISTIC_UUID).then(characteristic => {
        return characteristic.readValue();
    }).then(value => {
        // Byte array to hex string
        const psdi = new Uint8Array(value.buffer)
            .reduce((output, byte) => output + ("0" + byte.toString(16)).slice(-2), "");
        document.getElementById("device-psdi").innerText = psdi;
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffGetButtonStateCharacteristic(characteristic) {
    // Add notification hook for button state
    // (Get notified when button state changes)
    // デバイスからの通知を検知している
    characteristic.startNotifications().then(() => {
        characteristic.addEventListener('characteristicvaluechanged', e => {
            const val = (new Uint8Array(e.target.value.buffer))[0];
            if (val > 0) {
                // press
                uiToggleStateButton(true);
            } else {
                // release
                uiToggleStateButton(false);
                uiCountPressButton();
            }
            if (val != 0 && val % 30 === 0) {
                window.alert("ボタンクリック総計：" + val);
            }
        });
    }).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

// LEDボタンのクリック数の総計をデバイス側からnotifyで送っているので、
// それを取得する処理
// function liffGetLedButtonClickCount(characteristic) {
//     // startNotificationsは２つ指定できないのか？
//     // 上で、buttonStatusのnotificationwをstartしているので
//     characteristic.startNotifications().then(() => {
//         window.alert('LEDボタンイベントだよ。');
//         characteristic.addEventListener('characteristicvaluechanged', e => {
//             const val = (new Uint8Array(e.target.value.buffer))[0];
//             window.alert("LEDボタンの総クリック数" + val);
//         });
//     });
// }

function liffToggleDeviceLedState(state) {
    // on: 0x01
    // off: 0x00
    // デバイスに値を送っている
    // バイナリで送っている
    window.ledCharacteristic.writeValue(
        state ? new Uint8Array([0x3FF, 0x01]) : new Uint8Array([0x3FF, 0x00])
    ).catch(error => {
        uiStatusError(makeErrorMsg(error), false);
    });
}

function liffGetAndWriteUserOpinionToDevice() {
    // APIで取得したデータをhash形式で保持している
    setTimeout(async () => { getUserOpinion() }, 1);
}

async function getUserOpinion () {
    var step;
    for (step = 0; step < 10; step++) {
        // 暑い
        const atuiOpinion = await axios.get("https://script.google.com/macros/s/AKfycbwyOx1qqIu0SYBEFWROiUjKNN0Ar_vscxjke41e7-XfYCqsPKtJ/exec?q=hot_read");
        // 寒い
        const samuiOpinion = await axios.get("https://script.google.com/macros/s/AKfycbwyOx1qqIu0SYBEFWROiUjKNN0Ar_vscxjke41e7-XfYCqsPKtJ/exec?q=cold_read");
        // 快適
        const kaitekiOpinion = await axios.get("https://script.google.com/macros/s/AKfycbwyOx1qqIu0SYBEFWROiUjKNN0Ar_vscxjke41e7-XfYCqsPKtJ/exec?q=comfortable_read");
        const sosOpinion = await axios.get("https://script.google.com/macros/s/AKfycbwyOx1qqIu0SYBEFWROiUjKNN0Ar_vscxjke41e7-XfYCqsPKtJ/exec?q=sos_read");
        const atuiHexadecimal = exchangeToHexadecimal(atuiOpinion.data);
        const samuiHexadecimal = exchangeToHexadecimal(samuiOpinion.data);
        const kaitekiHexadecimal = exchangeToHexadecimal(kaitekiOpinion.data);
        const sosHexadecimal = exchangeToHexadecimal(sosOpinion.data);
        window.ledCharacteristic.writeValue(
            new Uint8Array([atuiHexadecimal, samuiHexadecimal, kaitekiHexadecimal, sosHexadecimal])
        ).catch(error => {
            window.alert('エラーです。');
        });    
    }
}

// 16進数に変換する関数
function exchangeToHexadecimal(userOpinion) {
    // userOpinionには、10進数の整数が入っている
    return '0x' + (('0000' + userOpinion.toString(16).toString(16).toUpperCase()).substr(-4));
    
}
