/* d3-velan - velocity picker */

var _version = '0.4.0';
var fs = require('fs')
var path = require('path')
var app = angular.module('psvelApp', []);

app.controller('MainCtrl', ['$scope', function ($scope) {
  self = this;
  self.version = _version;
  self.data = null;
  self.nmodata = null;
  self.orig = null;
  self.cdpfold = null;
  self.filename = null;
  self.fv = 1500;
  self.dv = 100;
  self.nv = 50;
  self.cdp = null;
  self.test1 = 1;
  self.test2 = 2;

  self.tv = null; // passed to d3-seis to plot an nmo line...

  var wsURL = 'ws://localhost:9191/websocket';
  var ws, servMsg;
  self.wsIsOpen = false;
  var tstr="tnmo=0", vstr="vnmo=100000";
  self.vpicks = [];
  /* start and periodically check for the server */

  function startws() {
    ws = new WebSocket(wsURL);
    ws.onopen = function() {
      self.wsIsOpen = true;
      console.log('ws opened');
      $scope.$apply();
    };
    ws.onerror = function() {
      console.log('ws err');
    };
  }
  function checkws() {
    //console.log('checking ws state');
    if(!ws || ws.readyState === WebSocket.CLOSED) {
      startws();
    }
  }
  checkws();
  setInterval(checkws, 5000);

  // get hdrs only
  self.open = function() {
    var chooser = document.getElementById('openfile');
    chooser.addEventListener('change', function () {
      var filepath = this.value;
      if(self.filename === filepath) { return;}
      self.filename = filepath;
      self.basename = path.basename(self.filename);

      servMsg = {cmd:'getSegyHdrs', filename: self.filename};
      ws.send(JSON.stringify(servMsg));

      ws.onmessage = function(evt) {
        var msg = JSON.parse(evt.data);
        if(msg['cmd'] === 'getSegyHdrs') {
          var segyHdrs = JSON.parse(msg['segyHdrs']);
          //console.log(msg['cmd'], segyHdrs)

        // group into ensembles
          hdrsByEnsemble = d3.nest()
            .key(function(d) {return d.cdp;})
            .entries(segyHdrs.hdrs);
            // returns [{key:'0', values:[trc0, trc1, ...]}]
          console.log('hdrs by ens', hdrsByEnsemble);
          self.nens = hdrsByEnsemble.length;
          self.ens0 = hdrsByEnsemble[0].key;
          self.ensN = hdrsByEnsemble[self.nens-1].key;
          self.dt = segyHdrs.dt;
          self.ns = segyHdrs.ns;
          self.startT = 0.;
          self.endT = (self.ns-1) * self.dt;
          self.currEns = +self.ens0;
          self.cdpfold = hdrsByEnsemble.map(function(d){return {cdp:d.key, fold:d.values.length}});
          console.log('cdpfold', self.cdpfold);
          $scope.$apply();
//          console.log(self.nens, self.ens0, self.ensN, self.dt, self.currEns);
        }
      }
    })
    // presses the actual openfile (hidden) button
    chooser.click();
  }

  self.getens = function() {
    servMsg = {cmd:'getVelan', ensemble:self.currEns,
      fv:self.fv, dv:self.dv, nv:self.nv};
    ws.send(JSON.stringify(servMsg));

    // get an uncorrected cdp gather
    tstr="tnmo=0", vstr="vnmo=100000";

    servMsg = {cmd:'getNMO', filename:self.filename,
      ensemble: self.currEns, vnmo: vstr, tnmo: tstr};
    ws.send(JSON.stringify(servMsg));

    ws.onmessage = function(evt) {
      var msg = JSON.parse(evt.data);
      if (msg['cmd'] === 'getVelan') {
        var velan = JSON.parse(msg['velan']);
        console.log('velan', velan);
        //console.log(velan['traces']);
        var trcs = velan['traces'];
        self.cdp = velan['traces'][0].cdp;

        var varr = [];
        for(var i=0; i<trcs.length; i++) {
          for(var j=0; j<trcs[i].samps.length; j++) {
            varr.push(trcs[i].samps[j]);
          }
        }
        console.log(varr, self.cdp);
        self.data = {'varr':varr,
          'cdp': self.cdp,
          'ns': velan.ns,
          'dt': velan.dt,
          'fv': velan.fv,
          'nv': velan.nv,
          'dv': velan.dv};
        $scope.$apply();
      } else if(msg['cmd'] === 'getNMO') {
        var nmogath = JSON.parse(msg['NMO']);
        console.log(nmogath);
        self.nmodata=nmogath;
        self.orig = JSON.parse(msg['NMO']); // make a separate copy
        $scope.$apply();
      }
    }
  }

  // when the user chooses "save", this function is called
  self.save = function() {
  //console.log('savemenu click');
  var chooser = document.getElementById('savefile');
  //console.log(chooser);
  chooser.addEventListener('change', function() {
    var filepath = this.value;
    console.log(filepath);
  //      console.log(picks);
    fs.writeFileSync(filepath,
      JSON.stringify({
        'sufile':self.filename,
        'picktime':new Date(),
        'picks': self.allpicks
      }));
    //      fs.writeFileSync(filepath, JSON.stringify(pickedTraces));
  })
  chooser.click();
  };

  self.settv = function(tv){
    //console.log('tv', tv);
    self.tv = tv;
    $scope.$apply()
  };

   // this fn is called the d3-velan when a new pick is made..
  self.setpicks = function(picks) {
    console.log('setpicks', picks);

    var cdppicks = picks.find(function(d) {return d.cdp == self.cdp;});
    var vpicks = [];
    if(typeof cdppicks == 'undefined') {
      vpicks = [];
    } else {
      vpicks = cdppicks.picks;
    }
    
    if(vpicks.length === 0) { // deleted all picks...
      tstr="tnmo=0";
      vstr="vnmo=100000"; // kludge - no nmo = nmo at high vel?
    } else {
      tstr = 'tnmo=';
      tstr+=vpicks.map(function(d){return d.t * 1000;}).join(',');
      vstr = 'vnmo=';
      vstr += vpicks.map(function(d) {return d.v;}).join(',');
    }
    console.log(tstr, vstr);
    // update the local copy of picks - for savefile
    self.allpicks = picks;

    servMsg = {cmd:'getNMO', filename:self.filename,
      ensemble: self.currEns, vnmo: vstr, tnmo: tstr};
    ws.send(JSON.stringify(servMsg));
    ws.onmessage = function(evt) {
      var msg = JSON.parse(evt.data);
      if(msg['cmd'] === 'getNMO') {
        var nmogath = JSON.parse(msg['NMO']);
        console.log(nmogath);
        self.nmodata=nmogath;
        $scope.$apply();
      }
    }
  }

  var nx=50, ny=50;
  var data = [];
  for(var i=0; i<ny; i++) {
    for(var j=0; j<nx; j++) {
      var s = 5;
      var c = 1.0/(s * Math.sqrt(2.0 * Math.PI));
      data.push({t:i/50.0, v:j*10 + 1000, a:c * Math.exp(-(j-i)*(j-i)/(s*s))});
    }
  }
  //self.data = data;
  //console.log(data);
}])
