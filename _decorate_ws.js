const DefaultWebSocket = require("ws");
const hidden_attr = require("./_symbols");


function do_heartbeat(ws){
    console.log("Setting up heartbeat mechanism.");

    const pingTimeout = hidden_attr(this, "pingTimeout");
    const pingFrequency = hidden_attr(this, "pingFrequency");

    let lastPing = 0;
    let lastPong = 0;
    hidden_attr(this, "pingTimedOut", false);

    let on_timeout = ()=>{
        console.log("ReconnectingWebsocket: server no response...");
        hidden_attr(this, "pingTimedOut", true);
        this.refresh();
    }

    let recv_heartbeat = ()=>{
        lastPong = new Date().getTime();
        console.log("ReconnectingWebsocket: got pong!");
    }
    ws.on("pong", recv_heartbeat);

    const pinging = setInterval(()=>{
        if(lastPing - lastPong > pingTimeout) on_timeout();

        if(
            !ws ||
            hidden_attr(this, "pingTimedOut")
        ){
            clearInterval(pinging);
            return;
        }
        lastPing = new Date().getTime();
        ws.ping();
        console.log("ReconnectingWebsocket: send ping!");
    }, pingTimeout / pingFrequency);
}





module.exports = function(ws, { reconnectAttempt }){
    const self = this;

    let timeout = setTimeout(function() {
        /*if (self.debug || ReconnectingWebSocket.debugAll) {*/
        console.debug('ReconnectingWebSocket', 'connection-timeout', hidden_attr(this, "url"));
        /*}*/
        hidden_attr(this, "timedOut", true);
        ws.close();
        hidden_attr(this, "timedOut", false);
    }, hidden_attr(this, "timeoutInterval"));

    ws.onopen = (event)=>{
        clearTimeout(timeout);
        /*if (self.debug || ReconnectingWebSocket.debugAll) {
            console.debug('ReconnectingWebSocket', 'onopen', self.url);
        }*/
        hidden_attr(this, "protocol", ws.protocol);
        hidden_attr(this, "readyState", DefaultWebSocket.OPEN);
        hidden_attr(this, "reconnectAttempts", 0);

        let e = new Event('open');
        e.isReconnect = reconnectAttempt;
        reconnectAttempt = false;
        
        this.dispatchEvent(e);
    };

    ws.onclose = (event)=>{
        clearTimeout(timeout);
        ws = null;

        if (hidden_attr(this, "forcedClose")){
            hidden_attr(this, "readyState", DefaultWebSocket.CLOSED);
            this.dispatchEvent(new Event('close'));
            return;
        }

        hidden_attr(this, "readyState", DefaultWebSocket.CONNECTING);
        var e = new Event('connecting');
        e.code = event.code;
        e.reason = event.reason;
        e.wasClean = event.wasClean;
        this.dispatchEvent(e);

        if(
            !hidden_attr(this, "reconnectAttempt") &&
            !hidden_attr(this, "timedOut")
        ){
            /*if (self.debug || ReconnectingWebSocket.debugAll) {
                console.debug('ReconnectingWebSocket', 'onclose', self.url);
            }*/
            this.dispatchEvent(new Event('close'));
        }

        let waittime = hidden_attr(this, "reconnectInterval") * Math.pow(
            hidden_attr(this, "reconnectDecay"),
            hidden_attr(this, "reconnectAttempts")
        );
        setTimeout(()=>{
            hidden_attr(
                this,
                "reconnectAttempts",
                hidden_attr(this, "reconnectAttempts") + 1
            );
            this.open(true);
        }, (
            waittime > hidden_attr(this, "maxReconnectInterval") ? 
            hidden_attr(this, "maxReconnectInterval")            :
            waittime
        ));
    };

    ws.onmessage = (event)=>{
        /*if (self.debug || ReconnectingWebSocket.debugAll) {
            console.debug('ReconnectingWebSocket', 'onmessage', self.url, event.data);
        }*/
        let e = new Event('message');
        e.data = event.data;
        this.dispatchEvent(e);
    };

    ws.onerror = (event)=>{
        /*if (self.debug || ReconnectingWebSocket.debugAll) {
            console.debug('ReconnectingWebSocket', 'onerror', self.url, event);
        }*/
        this.dispatchEvent(new Event('error'));
    };

    // if ws has .ping() defined(as in `ws` library), use that
    if(ws.ping !== undefined){
        do_heartbeat.call(this, ws);
    }

}