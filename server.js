var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server);
var p2p = require('socket.io-p2p-server').Server;
io.use(p2p);
var port = 1337;

//set static folder for application
app.use(express.static("public"));

// serve application
app.get("/", function(request, response) {
	response.sendFile(__dirname + "/index.html");
});

// open port 1337 for communication
server.listen(1337, function() {
	console.log("Listening on port %s", port);
});

// new connection event
io.on("connection", function(socket) {
	console.log(socket.id);
});