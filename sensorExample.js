"use strict";
const chalk = require('chalk');  // To color console log

// Use the Azure IoT device SDK for devices that connect to Azure IoT Central. 
var iotHubTransport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;
var provisioningHost = 'global.azure-devices-provisioning.net';

// Enter your Azure IoT keys
var idScope = '<ID_ESCOPE>';
var registrationId = '<ID>';
var symmetricKey = '<PRIMARYKEY>';

var provisioningSecurityClient = new SymmetricKeySecurityClient(registrationId, symmetricKey);
var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, idScope, new ProvisioningTransport(), provisioningSecurityClient);
var hubClient;

// Enum values Device
const stateDeviceEnum = Object.freeze({ "Off": "off", "On": "on", "Failed": "failed" });
const waterLevelEnum = Object.freeze({ "Dry": "dry", "Level1": "level1", "Level2": "level2" });

// Global Parameters
var sensorNameDevice = "BH - Venda Nova - 01";
var humidityDevice = 0
var temperatureDevice = 0
var baseLat = -19.970256578641237; // Base position latitude. 
var baseLon = -44.01700026331516; // Base position longitude. 
var currentLat = baseLat; // Current position latitude. 
var currentLon = baseLon; // Current position longitude. 
var state = stateDeviceEnum.On;  // init State
var waterLevelDevice = waterLevelEnum.Dry; // Nivel do alagamento inicial do Sensor 
var timeInterval = 10000; // time interval to send data to Iot Central
const noEvent = "none";
var eventText = noEvent; // Text to send to the IoT operator. 


//To color console log
function greenMessage(text) {
    console.log(chalk.green(text) + "\n");
}
function redMessage(text) {
    console.log(chalk.red(text) + "\n");
}


function turnOnDevice(request, response) {
    // set state to on
	state = stateDeviceEnum.On;  
	
	 // Acknowledge the command. 
    response.send(200, 'Success', function (errorMessage) {

		// Failure
        if (errorMessage) {
            redMessage('Failed sending a turnOnDevice response:\n' + errorMessage.message);
        } else {
            eventText = "Device was turn on."
            let eventdata = getEventToSend()
            sendData(eventdata);
        }
    });

	return;
}


function turnOffDevice(request, response) {
    // set state to off
	state = stateDeviceEnum.Off;

	 // Acknowledge the command. 
    response.send(200, 'Success', function (errorMessage) {

        // Failure 
        if (errorMessage) {
            redMessage('Failed sending a turnOffDevice response:\n' + errorMessage.message);
        } else {
                eventText = "Device was turn off."
                let eventdata = getEventToSend()
                sendData(eventdata);
        }
    });

	return;
}


function simulateWeather() {
	// humidity generate by Random
    // Temperature generae by Random
	// Water level rises when rain...

	greenMessage("Simulating Weather");

    humidityDevice = Math.floor(Math.random() * 90 + 10)
    temperatureDevice = simulateTemperature()

    // Simula chuva com alagamento de acordo com a hora do dia.

    let hoursNow = new Date().getHours();

    if (hoursNow > 0 && hoursNow <=8  && temperatureDevice > 20  && humidityDevice > 70) {
        waterLevelDevice = waterLevelEnum.Level1;
    } else if ( hoursNow >= 18 && hoursNow <=23 && temperatureDevice > 15 ) {
        waterLevelDevice = waterLevelEnum.Level2;
        eventText = "Detect water";
    }

	return;
}

function simulateTemperature() {

    // simlute temperature, with range -20 and +40 celsius
    let minTemp = -20;
    let maxTemp = 40;
    let tempNumberRandom = Math.random();
    return tempNumberRandom > 0.3 ?  Math.floor(tempNumberRandom * maxTemp) :  Math.floor(tempNumberRandom * - minTemp);

}

function getEventToSend() {
    // Get possible event data to send to Azure.
     
    if (eventText != noEvent) {
        let tempDataEvent = JSON.stringify(
            {
                Event: eventText,
            }
        );

        // reset event text to noevent variable value
        eventText = noEvent;
        // return event json
        return tempDataEvent;
    } else {
        // return false when has no more event to send
        return false;
    }
}


function sendData(data){

    // Create the message IOT by using the preceding defined data. 

    let message = new Message(data);
    console.log("Message: " + data);

    // Send the message. 
    hubClient.sendEvent(message, function (errorMessage) {
        // Error 
        if (errorMessage) {
            redMessage("Failed to send message to Azure IoT Central: ${err.toString()}");
        } else {
            greenMessage("Telemetry sent");
        }
    });
}


function sendSensorTelemetry() {
    
    // Send telemetry only when device is on.

    if (state == stateDeviceEnum.On) {
        // Similute Weather. Here you can call function that collects Raspberry data.
        simulateWeather();

        // Create the telemetry data JSON package. 
        let data = JSON.stringify(
            {
                State: state,
                Humidity: humidityDevice,
                WaterLevel: waterLevelDevice,
                Temperature: temperatureDevice
            });

        // if has event to send, get and concat in data variable
        let eventdata = getEventToSend()
        if (!!eventdata) {
            data+= eventdata
        };

        sendData(data);
    }
}


/////////////// Send Properties
// Send device twin reported properties. 
function sendDeviceProperties(twin, properties) {
    twin.properties.reported.update(properties, (err) => greenMessage(`Sent device properties: ${JSON.stringify(properties)}; ` +
        (err ? `error: ${err.toString()}` : `status: success`)));
}


////// Handle device connection to Azure IoT Central. 
// connectCallback send properties and call setInteval to send telemetry.
var connectCallback = (err) => {
    if (err) {
        redMessage(`Device could not connect to Azure IoT Central: ${err.toString()}`);
    } else {
        greenMessage('Device successfully connected to Azure IoT Central');

        // Envia dados do sensor para o Iot Azure a cada x segundos.
        setInterval(sendSensorTelemetry, timeInterval);

        // Get device twin from Azure IoT Central. 
        hubClient.getTwin((err, twin) => {
            if (err) {
                redMessage(`Error getting device twin: ${err.toString()}`);
            } else {

                // Send device properties once on device start up. 
                let properties =
                {
                    // Format: 
                    sensorName: sensorNameDevice,
					Location: {
							// Names must be lon, lat. 
							lon: currentLon,
							lat: currentLat
						},
                };
				
                sendDeviceProperties(twin, properties);
                eventText = "Device was started."
                hubClient.onDeviceMethod('TurnOff', turnOffDevice);
                hubClient.onDeviceMethod('TurnOn', turnOnDevice);
				
            }
        });
    }
};


// Start the device (register and connect to Azure IoT Central). 
provisioningClient.register((err, result) => {
    if (err) {
        redMessage('Error registering device: ' + err);
    } else {
        greenMessage('Registration succeeded');
        console.log('Assigned hub=' + result.assignedHub);
        console.log('DeviceId=' + result.deviceId);
        var connectionString = 'HostName=' + result.assignedHub + ';DeviceId=' + result.deviceId + ';SharedAccessKey=' + symmetricKey;
        hubClient = Client.fromConnectionString(connectionString, iotHubTransport);
        hubClient.open(connectCallback);
    }
});