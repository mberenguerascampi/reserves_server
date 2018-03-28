const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({origin: true});
const nodemailer = require('nodemailer');
const pushIdGenerator = require('./generate-pushid.js');
admin.initializeApp(functions.config().firebase);

// Configure the email transport using the default SMTP transport and a GMail account.
// For Gmail, enable these:
// 1. https://www.google.com/settings/security/lesssecureapps
// 2. https://accounts.google.com/DisplayUnlockCaptcha
// 2.2: https://accounts.google.com/b/0/displayunlockcaptcha
// For other types of transports such as Sendgrid see https://nodemailer.com/transports/
// TODO: Configure the `gmail.email` and `gmail.password` Google Cloud environment variables.
//const gmailEmail = functions.config().gmail.email;
//const gmailPassword = functions.config().gmail.password;
const mailTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "plusbits.solutions@gmail.com",
    pass: "lapaxita+",
  },
});

const APP_NAME = "Pàdel Puig-reig";

var validateParams = function(json){
	var keys = ["horaIni", "horaFi", "data"];
	for (index in keys) {
		var key = keys[index];
		if (json[key] === undefined) return false;
	};

	return true;
};

/**
	Returns:
		0: hora1 == hora2
		-1: hora1 < hora2
		1: hora1 > hora2
*/
var compareHours = function(hora1, hora2){
	var arrTime1 = hora1.split(":");
	var arrTime2 = hora2.split(":");

	var hour1 = parseInt(arrTime1[0]);
	var min1 = parseInt(arrTime1[1])
	var hour2 = parseInt(arrTime2[0]);
	var min2 = parseInt(arrTime2[1])

	if (hour1 === hour2 && min1 === min2) return 0;
	if (hour1 < hour2 || (hour1 === hour2 && min1 < min2)) return -1;
	return 1;
};

var lessOrEqual = function(hora1, hora2){
	var cmp = compareHours(hora1, hora2);
	return (cmp === 0 || cmp === -1);
};

var moreOrEqual = function(hora1, hora2){
	var cmp = compareHours(hora1, hora2);
	return (cmp === 0 || cmp === 1);
};

var validateDates = function(horaIni1, horaFi1, horaIni2, horaFi2){
	return compareHours(horaIni1, horaFi1) === -1 && //horaIni1 < horaFi1 
			compareHours(horaIni2, horaFi2) === -1  && //horaIni2 < horaFi2 
			(lessOrEqual(horaFi1, horaIni2) || //horaFi1 <= horaIni2  
			moreOrEqual(horaIni1, horaFi2)) //horaIni1 >= horaFi2
};

var getNotUndefinedValue = function(value){
  return value != undefined ? value : "";
}

var getToken = function(headers){
  var idToken = headers["authorization"];
  if(idToken !== undefined) idToken = idToken.replace("Bearer ","");
  return idToken;
};

// Adds a reservation to Realtime Database
exports.addReservation = functions.https.onRequest((req, res) => {
  cors(req, res, () => {});
  // Grab the text parameter.
  console.log(req.method);
  if (req.method != "POST") {
     res.status(400).send("Only POST request is available");
     return;
  }

  var body = req.body;
  var idToken = getToken(req.headers); 

  //Validem el token de l'ususuari
  admin.auth().verifyIdToken(idToken).then(function(decodedToken) {
    var uid = decodedToken.uid;
    var email = decodedToken.email;
    body["userUid"] = uid;
    console.log(body);
    
    if (!validateParams(body)){
      res.status(400).send("Some paramater is missing");
      return;
    }

    var bData = body["data"];
    var arrbData = bData.split("/");
    var bYear = arrbData[2];
    var bMonth = arrbData[1];
    var bDay = arrbData[0];

    var ref = admin.database().ref("/reservations/"+ bYear + "/" + bMonth + "/" + bDay);
    ref.once("value", function(snapshot) {
      var valid = true;

      snapshot.forEach(function(childSnapshot) {
        var data = childSnapshot.val();

        if (!validateDates(body.horaIni, body.horaFi, data.horaIni, data.horaFi)){
          valid = false;
          console.log(body["data"] + " =>" + data["data"] + "," + data.horaIni  + "," + data.horaFi);
          res.status(400).send("Invalid date");
          return;
        }
      });

      if (valid){
        console.log("Push reservation");

        //Generate an unique key
        var genkey = pushIdGenerator.generatePushID();
        console.log("genkey");
        console.log(genkey);
        
        ref.child(genkey).set(body).then(snapshot => {
        //var newPostRef = ref.push(body).then(snapshot => {
          //console.log(snapshot);
          //var key = snapshot.getKey()
          sendReservationEmail(body, email, "", genkey);
           // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
          res.status(200).send("success");
        });
      }
    });
  }).catch(function(error) {
    res.status(400).send("Invalid auth");
  });
});

exports.createUser = functions.auth.user().onCreate((event) => {
  var user = event.data; // The Firebase user.
  user["cupons"] = {"prova": {"value": 5, "expiredDate": "11/11/2018"}};
  console.log("createUser: " + user.uid);

  var usersRef = admin.database().ref("/users");

  usersRef.child(user.uid).set(user).then((res) => {
    
  });

  return console.log('User created');
});

exports.editUser = functions.https.onRequest((req, res) => {
  cors(req, res, () => {});

  if (req.method != "POST") {
     res.status(400).send("Only POST request is available");
     return;
  }

  var body = req.body;
  var idToken = getToken(req.headers); 

  //Validem el token de l'ususuari
  admin.auth().verifyIdToken(idToken).then((decodedToken) => {
    console.log("verifyIdToken");
    var uid = decodedToken.uid;
    var email = decodedToken.email;

    var userRef = admin.database().ref("/users/" + uid);
    userRef.once("value", (snapshot) => {
      var savedUser = snapshot.val()
      console.log("inside value");
      savedUser["email"] = getNotUndefinedValue(body["email"]);
      savedUser["displayName"] = getNotUndefinedValue(body["displayName"]);
      savedUser["phone"] = getNotUndefinedValue(body["phone"]);

      userRef.set(savedUser).then((result) => {
        res.status(200).send("success");
      });
    });
  }).catch(function(error) {
    res.status(400).send("Invalid auth");
  });
});

// Sends a welcome email to the given user.
function sendReservationEmail(reservation, email, displayName, key) {
  const mailOptions = {
    from: `${APP_NAME} <noreply@firebase.com>`,
    to: email,
  };

  // The user subscribed to the newsletter.
  mailOptions.subject = `Reserva realitzada a ${APP_NAME}!`;
  mailOptions.text = `Hola, has realitzat correctament la reserva a ${APP_NAME} pel dia ${reservation["data"]} de ${reservation.horaIni} a ${reservation.horaFi}. La teva clau és aquesta: ${key}`;
  mailOptions.html = "<p> Hola, </p> <br> <p> Has realitzat correctament una reserva a " + APP_NAME + "</p>" +
                        "<p><b>Codi:</b>" + key +"</p>" +
                        "<p><b>Dia:</b>" + reservation["data"] +"</p>" +
                        "<p><b>Hora inici:</b>" + reservation.horaIni +"</p>" +
                        "<p><b>Hora final:</b>" + reservation.horaFi +"</p>";
  return mailTransport.sendMail(mailOptions).then(() => {
    return console.log('New reservation email sent to:', email);
  });
}