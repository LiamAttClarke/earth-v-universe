var http = require("http");
var express = require("express");

var app = express();

app.use(express.static("public"));
app.get("/", function(request, response) {
	response.sendFile(__dirname + "public/index.html");
});
var server = app.listen(1337);
var io = require("socket.io").listen(server);

/*io.sockets.on("connection", function(client) {
	console.log("connection", client);
});*/