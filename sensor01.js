"use strict";
const chalk = require('chalk');

// Use the Azure IoT device SDK for devices that connect to Azure IoT Central. 
var iotHubTransport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;
var provisioningHost = 'global.azure-devices-provisioning.net';

// Enter your Azure IoT keys
var idScope = '0ne00398944';
var registrationId = 'sensorbh01';
var symmetricKey = 'M7cZnaVSQOsmGP5MWb86STzf9oPegoY4sHoXLpARf2o=';

var provisioningSecurityClient = new SymmetricKeySecurityClient(registrationId, symmetricKey);
var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, idScope, new ProvisioningTransport(), provisioningSecurityClient);
var hubClient;


function greenMessage(text) {
    console.log(chalk.green(text) + "\n");
}
function redMessage(text) {
    console.log(chalk.red(text) + "\n");
}

// CONTS
var sensorNameDevice = "BH - Venda Nova - 01";
var stateDeviceEnum = Object.freeze({ "Off": "off", "On": "on", "Failed": "failed" });
var waterLevelEnum = Object.freeze({ "Dry": "dry", "Level1": "level1", "Level2": "level2" });
const thresholdNormal = "dry"; 
const thresholdWarning = "level1"; 
const thresholdCritical = "leve22";
var humidityDevice = 0
var temperatureDevice = 0
var baseLat = -19.970256578641237; // Base position latitude. 
var baseLon = -44.01700026331516; // Base position longitude. 
var currentLat = baseLat; // Current position latitude. 
var currentLon = baseLon; // Current position longitude. 
var state = stateDeviceEnum.Ligado;  // init State
var waterLevelDevice = waterLevelEnum.Dry; // Nivel do alagamento inicial do Sensor 
var timeInterval = 100000; // time interval to send data to Iot Central
const noEvent = "none";
var eventText = noEvent; // Text to send to the IoT operator. 


function turnOnDevice(request, response) {
     // set state to on
	state = stateDeviceEnum.On;  
	
	 // Acknowledge the command. 
    response.send(200, 'Success', function (errorMessage) {

		// Failure
        if (errorMessage) {
            redMessage('Failed sending a turnOnDevice response:\n' + errorMessage.message);
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

    var hoursNow = new Date().getHours();

    if (hoursNow > 0 && hoursNow <=8  && temperatureDevice > 20  && humidityDevice > 70) {
        waterLevelDevice = waterLevelEnum.Level1;
    } else if ( hoursNow >= 18 && hoursNow <=23 && temperatureDevice > 15 ) {
        waterLevelDevice = waterLevelEnum.Level2;
        eventText = "Detect water";
    }

	return;
}

function simulateTemperature() {

    let tempNumberRandom = Math.random();
    return tempNumberRandom > 0.3 ?  Math.floor(tempNumberRandom * 50) :  Math.floor(tempNumberRandom * -30);

}

//////////////////////// SEND DATA AND EVENT ////////////////////////

function sendSensorTelemetry() {
    
    // Send telemetry only when device is on.

    if (state == stateDeviceEnum.On) {
        // Similute Weather. 
        simulateWeather();

        // Create the telemetry data JSON package. 
        var data = JSON.stringify(
            {
                EstadoDoDispositivo: state,
                Humidity: humidityDevice,
                WaterLevel: waterLevelDevice,
                Temperature: temperatureDevice
            });

        // Add the eventText event string, if there is one. 
        if (eventText != noEvent) {
            data += JSON.stringify(
                {
                    Evento: eventText,
                }
            );
            eventText = noEvent;
        }

        // Create the message IOT by using the preceding defined data. 
        var message = new Message(data);
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
                var properties =
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