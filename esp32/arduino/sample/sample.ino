#include <BLEServer.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Device Name: Maximum 30 bytes
#define DEVICE_NAME "Tomoya LINE THINGS BLE"

// User service UUID: Change this to your generated service UUID
#define USER_SERVICE_UUID "180ceb9c-07a3-4f06-95e7-7927579f2c7c"
// User service characteristics
#define WRITE_CHARACTERISTIC_UUID "E9062E71-9E62-4BC6-B0D3-35CDCD9B027B"
#define NOTIFY_CHARACTERISTIC_UUID "62FBD229-6EDD-4D1A-B554-5C4E1BB29169"

#define NOTIFY_LED_BUTTON_CLICK_CHARACTERISTIC_UUID "839ff311-21a1-4114-adc0-543477dc7389"

// PSDI Service UUID: Fixed value for Developer Trial
#define PSDI_SERVICE_UUID "e625601e-9e55-4597-a598-76018a0d293d"
#define PSDI_CHARACTERISTIC_UUID "26E2B12B-85F0-4F3F-9FDD-91D114270E6E"


//#define READ_CHARACTERISTIC_UUID "af930343-cc42-4b47-80e3-b47a6b585d26"

#define BUTTON 0
#define LED1 2

BLEServer* thingsServer;
BLESecurity *thingsSecurity;
BLEService* userService;
BLEService* psdiService;
BLECharacteristic* psdiCharacteristic;
BLECharacteristic* writeCharacteristic;
BLECharacteristic* notifyCharacteristic;
BLECharacteristic* ledNotifyCharacteristic;
//BLECharacteristic* readCharacteristic;

bool deviceConnected = false;
bool oldDeviceConnected = false;

// グローバル変数でbutton_actionを設定
volatile int btnAction = 0;


class serverCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
   deviceConnected = true;
  };

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
  }
};

int ledClickCount = 0;
// ここで,セントラルから送られてきた値を取得している。
// 具体的には、LEDライトのON OFFの値を取得。
class writeCallback: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *bleWriteCharacteristic) {
//  バイナリで送られてくるので、変換する必要がある
//  std::stringはc++の型なので、c言語のライブラリであるprintfでは受け取れない。
//  なので、.c_str()でC言語のchar＊に変換する必要がある
    std::string value = bleWriteCharacteristic->getValue();
//  セントラルから、（暑い、寒い、快適）[13, 43, 23]みたいな順番に送ってくる
//  LEDボタンのときは、value[0]に-1が格納。票のときは、票数をintで送る
    int decisionNum = (char)value[0];
    Serial.print("ボタンか票の判断数字");
    Serial.println(decisionNum);
    if (decisionNum == 255) {
//    LEDボタンが押された
      ledClickCount++;
      Serial.print("LEDライトボタンのクリック総計：");
      Serial.println(ledClickCount);
      if (ledClickCount % 30 == 0) {
//      LEDライトボタンのクリック総計が30の倍数を超える毎にLIFFに通知する
        Serial.print("LEDボタンのクリック数が");
        Serial.println(ledClickCount);
        Serial.print("を超えました。");
        ledNotifyCharacteristic->setValue(ledClickCount);
        ledNotifyCharacteristic->notify();
      }
      if ((char)value[1] <= 1) {
        int num = (char)value[1];
        Serial.println(num);
        Serial.print("LED オン");
        digitalWrite(LED1, (char)value[1]);
      }
    } else {
//       暑いなどの票数を送られてきた。
      int atuiClickCount = (char)value[0];
      int samuiClickCount = (char)value[1];
      int kaitekiClickCount = (char)value[2];
      int totalClickCount = atuiClickCount + samuiClickCount + kaitekiClickCount;
  
      Serial.print("暑いの総カウント数");
      Serial.println(atuiClickCount);
      Serial.print("寒いの総カウント数");
      Serial.println(samuiClickCount);
      Serial.print("快適の総カウント数");
      Serial.println(kaitekiClickCount);
      Serial.print("合計カウント数");
      Serial.println(totalClickCount);
    }
  }
};

void setup() {
  Serial.begin(115200);

  // pinModeは、ピンの動作を入力か、出力かに設定する。
  // 出力に設定
  pinMode(LED1, OUTPUT);
  // 入力・出力に設定
  pinMode(BUTTON, INPUT_PULLUP);
  // 外部割り込みが発生した際に実行する関数を指定する
  // CHANGEは、buttonの状態が変化した際に発生
  attachInterrupt(BUTTON, buttonAction, CHANGE);

  BLEDevice::init("BEL DEVICE");
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT_NO_MITM);

  // Security Settings
  BLESecurity *thingsSecurity = new BLESecurity();
  thingsSecurity->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_ONLY);
  thingsSecurity->setCapability(ESP_IO_CAP_NONE);
  thingsSecurity->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

  setupServices();
  startAdvertising();
  Serial.println("Ready to Connect");
}

// ボタン押された回数を保持するグローバル変数
int btnCount = 0;

void loop() {
  uint8_t btnValue;

  while (btnAction > 0 && deviceConnected) {
    btnValue = !digitalRead(BUTTON);
    // ボタンが押されたときは、btnValue==1、話したときは0
    Serial.println(btnValue);
    btnAction = 0;
    // デバイス側のボタンが押された時に、notifyで送るバリューを設定している
    notifyCharacteristic->setValue(&btnValue, 1);
    // 実際にnotifyを実行する
    notifyCharacteristic->notify();
    delay(20);

    // btnValueが1のとき（ボタンが押されているとき）に実行される
    if(btnValue) {
      btnCount++;
      Serial.print("クリック総計：");
      Serial.println(btnCount);
      // LIFFから読み込むためのバリューを設定
//      readCharacteristic->setValue(btnCount);
      // ボタンがクリックされた回数が30回ごとに、セントラル側に通知する
      if(btnCount % 30 == 0) {
        notifyCharacteristic->setValue(btnCount);
        notifyCharacteristic->notify();
        delay(20);
      }
    }
  }
  // Disconnection
  if (!deviceConnected && oldDeviceConnected) {
    delay(500); // Wait for BLE Stack to be ready
    thingsServer->startAdvertising(); // Restart advertising
    oldDeviceConnected = deviceConnected;
  }
  // Connection
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}

void setupServices(void) {
  // Create BLE Server
  thingsServer = BLEDevice::createServer();
  thingsServer->setCallbacks(new serverCallbacks());

  // Setup User Service
  userService = thingsServer->createService(USER_SERVICE_UUID);
  // Create Characteristics for User Service

  // writeのcharacteristicを設定
  writeCharacteristic = userService->createCharacteristic(WRITE_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_WRITE);
  writeCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  writeCharacteristic->setCallbacks(new writeCallback());
  
  // notifyのcharateristicを設定
  notifyCharacteristic = userService->createCharacteristic(NOTIFY_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  notifyCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  BLE2902* ble9202 = new BLE2902();
  ble9202->setNotifications(true);
  ble9202->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  notifyCharacteristic->addDescriptor(ble9202);

  // notify_led_click_characteristicを設定
  ledNotifyCharacteristic = userService->createCharacteristic(NOTIFY_LED_BUTTON_CLICK_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  ledNotifyCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  BLE2902* ble9202ForLed = new BLE2902();
  ble9202ForLed->setNotifications(true);
  ble9202ForLed->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  ledNotifyCharacteristic->addDescriptor(ble9202ForLed);

  // readのcharacteristicを設定
//  readCharacteristic = userService->createCharacteristic(READ_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_READ);
//  readCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED);
//  readCharacteristic->setValue(0); // とりあえず0で初期化

  // Setup PSDI Service
  psdiService = thingsServer->createService(PSDI_SERVICE_UUID);
  psdiCharacteristic = psdiService->createCharacteristic(PSDI_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_READ);
  psdiCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);

  // Set PSDI (Product Specific Device ID) value
  uint64_t macAddress = ESP.getEfuseMac();
  psdiCharacteristic->setValue((uint8_t*) &macAddress, sizeof(macAddress));

  // Start BLE Services
  userService->start();
  psdiService->start();
}

void startAdvertising(void) {
  // Start Advertising
  BLEAdvertisementData scanResponseData = BLEAdvertisementData();
  scanResponseData.setFlags(0x06); // GENERAL_DISC_MODE 0x02 | BR_EDR_NOT_SUPPORTED 0x04
  scanResponseData.setName(DEVICE_NAME);

  thingsServer->getAdvertising()->addServiceUUID(userService->getUUID());
  thingsServer->getAdvertising()->setScanResponseData(scanResponseData);
  thingsServer->getAdvertising()->start();
}

void buttonAction() {
  btnAction++;
}
