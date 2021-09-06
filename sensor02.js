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
var registrationId = 'sensorbh02';
var symmetricKey = 'Od/5zP8qsTnME6z+WdnLiUXM0wM6gp5FWqecJOphpqA=';

var provisioningSecurityClient = new SymmetricKeySecurityClient(registrationId, symmetricKey);
var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, idScope, new ProvisioningTransport(), provisioningSecurityClient);
var hubClient;


function greenMessage(text) {
    console.log(chalk.green(text) + "\n");
}
function redMessage(text) {
    console.log(chalk.red(text) + "\n");
}

// CONSTANTES
// Sensor  globals initialized to the starting state


var nomeSensor = "BH - Barreiro - 02";
var estadoDispositivoEnum = Object.freeze({ "Desligado": "desligado", "Ligado": "ligado", "Com falha": "comfalha" });
var alagamentoEnum = Object.freeze({ "Seco": "seco", "Nivel1": "nivel1", "Nivel2": "nivel2" });
const thresholdSeco = "seco"; 
const thresholdAlagadoNivel1 = "nivel1"; 
const thresholdAlagadoNivel2 = "nivel2";
var umidade = 0 // umidade inicial de medição
var baseLat = -19.970337248327265; // Base position latitude.
var baseLon = -44.016442363867704; // Base position longitude.
var currentLat = baseLat; // Current position latitude. 
var currentLon = baseLon; // Current position longitude. 
var state = estadoDispositivoEnum.Ligado;  // Estado inicial do sensor
var nivelAlagamento = alagamentoEnum.Seco; // Nivel do alagamento inicial do Sensor 
var timeInterval = 100000;
const noEvent = "none";
var eventText = noEvent; // Text to send to the IoT operator. 



function ligarDevice(request, response) {
	
	console.log(request);
	state = estadoDispositivoEnum.Ligado;  
	
	 // Acknowledge the command. 
    response.send(200, 'Success', function (errorMessage) {

		// Failure
        if (errorMessage) {
            redMessage('Failed sending a ligarDevice response:\n' + errorMessage.message);
        }
    });

	return;
}


function desligarDevice(request, response) {
	
	console.log(request);
	state = estadoDispositivoEnum.Desligado;

	 // Acknowledge the command. 
    response.send(200, 'Success', function (errorMessage) {

        // Failure 
        if (errorMessage) {
            redMessage('Failed sending a desligarDevice response:\n' + errorMessage.message);
        }
    });

	return;
}


function simulateWeather() {
	// UMIDADE - RANDOM
	// SE HORA ENTRE 00 E 08:00, CHUVA MODERADA
	// SE HORA ENTRE 18 E 00:00, CHUVA INTENSA

	greenMessage("Simulando clima");

    umidade = Math.floor(Math.random() * 90 + 10)

    // Simula chuva com alagamento de acordo com a hora do dia.

    var horas = new Date().getHours();

    if (horas > 0 && horas <=8) {
        nivelAlagamento = alagamentoEnum.Nivel1;
    } else if ( horas >= 18 && horas <=23 ) {
        nivelAlagamento = alagamentoEnum.Nivel2;
        eventText = "Alagamento detectado no sensor";
    }

	return;
}


//////////////////////// ENVIA DADOS E EVENTOS ////////////////////////

function sendSensorTelemetry() {

    // Simular clima. 
    simulateWeather();

    // Create the telemetry data JSON package. 
    var data = JSON.stringify(
        {
            EstadoDoDispositivo: state,
            Umidade: umidade,
            NivelDeAlagamento: nivelAlagamento,
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

    // Create the message by using the preceding defined data. 
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


/////////////// ENRADAS DE PROPRIEDADES

// Send device twin reported properties. 
function sendDeviceProperties(twin, properties) {
    twin.properties.reported.update(properties, (err) => greenMessage(`Sent device properties: ${JSON.stringify(properties)}; ` +
        (err ? `error: ${err.toString()}` : `status: success`)));
}


////// Handle device connection to Azure IoT Central. 
// Handle device connection to Azure IoT Central. 
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
                    // <Property Name in Azure IoT Central> ":" <value in Node.js app> 
                    NomeSensor: nomeSensor,
					Localizao: {
							// Names must be lon, lat. 
							lon: currentLon,
							lat: currentLat
						},
                };
				
                sendDeviceProperties(twin, properties);
                hubClient.onDeviceMethod('Desligar', desligarDevice);
                hubClient.onDeviceMethod('Ligar', ligarDevice);
				
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