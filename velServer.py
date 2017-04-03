#!/usr/bin/env python
"""
NAME
    velServer -  websocket server for velocity data

RETURNS
   returns a json string
"""

from datetime import datetime
import sys
import os
import asyncio
import json
import websockets
import tempfile
import numpy as np
import scipy.signal as sig
import subprocess as sp
#import pprint

#print("loading obspy...")
from obspy.io.segy.segy import _read_su
#print("... done.")

# FIXME - this only works with 3.5, not 3.6
if sys.version_info == (3, 6):
    raise "** must use python v3.4 or 3.5"

class Segy(object):
    """Local version of the SU/SEGY file"""
    def __init__(self):
        self.filename = None
        self.hdrs = None
        self.traces = None
        self.nsamps = 0
        self.dt = 0
        self.segyfile = None

    def getTrc(self, trcNum, headonly=True, trctype='seismic', v0=1500, dv=100):
        """Convert a segy velocity trace to a python dict

        An obspy SegyTrace trace number trcNum is converted to a python dict.

        `suvelan < cdp.su fv=xx dv=xx nv=xx > vel.su`
        produces a new gather with one su trace per velocity,
        however, the trace headers do not contain the velocity info.

        Parameters:
        -----------
        trcNum : int
            SegyTrc trace index
        headonly: bool
            choose whether to read data or only headers
        trctype: string
            'seismic' returns {t:..., v:...} samps (time, value)
            'velocity' returns {t:..., v:..., a:...} (time, velocity, semblance)
        v0, dv: number
            velocity for first trace and increment between traces

        Returns:
        --------
        dict
            Dictionary with keys `tracl`, `tracr`, `ffid`, `offset`, and `samps`
            (at a minimum; see the code for the full list)

        """
        t = self.segyfile.traces[trcNum]
        dt = t.header.sample_interval_in_ms_for_this_trace/(1000.*1000.)
        nsamps = t.header.number_of_samples_in_this_trace
        samps = []

        ampscale = 1
        if not headonly:
            # because I used headonly in the original open,
            # the data are read anew from file every time data is
            # referenced (check this)
            d = t.data # read from file?
            #print('in gettrc', decimate)

            tarr=np.arange(0,nsamps*dt,dt)

            max = np.max(d)
            min = np.min(d)
            ampscale = (max-min)
            if ampscale != 0:
                d /= (max-min)

            #print("amp", ampscale, max, min)

            amparr = d.tolist()

            if trctype == 'velocity':
                vel = v0 + trcNum*dv;
                velarr = vel * np.ones(len(amparr))
                # create the samps array
                samps = [{'t':t,'a':a, 'v':v} for (t,a,v) in zip(tarr,amparr,velarr)]
            else:
                samps = [{'t':t,'v':v} for (t,v) in zip(tarr,amparr)]

            #print(samps)
        #print('ens num', t.header.ensemble_number)
        trc = {"tracl": t.header.trace_sequence_number_within_line,
               "tracr": t.header.trace_sequence_number_within_segy_file,
               "ffid": t.header.original_field_record_number,
               "cdp": t.header.ensemble_number,
               "offset": t.header.distance_from_center_of_the_source_point_to_the_center_of_the_receiver_group,
               "ampscale" : "{}".format(ampscale),
               "nsamps": len(samps),
               "dt": dt,
               "samps": samps}
        return trc

def handleMsg(msgJ):
    """Process the message in msgJ.

    Parameters:
    msgJ: dict
        Dictionary with command sent from client

    Returns:
    string
        JSON string with command response

    Commands are of the form:
    {'cmd' : 'getCCC', 'param0': 'param0val', ...}

    Response is a string of the form (note that JSON is picky that keys
    and strings should be enclosed in double quotes:
    '{"cmd" : "getCmd", "cmd" : "<response>"}'

    {'cmd':'getHello'} -> {"cmd":"getHello", "hello": "world"}

    {'cmd':'getSegyHdrs', filename: f} ->
        {"cmd":"getSegyHdrs", "segyhdrs":
                              {ns:nsamps, dt:dt: hdrs:[hdr1, hdr2...]}}

    FIXME FIXME - this currently returns "segy", not "ensemble" as the key
    WARNING - you must call getSegyHdrs first
    flo and fhi are optional.  If they are not present, no filtering
    {'cmd':'getEnsemble', filename:f, ensemble:n, [flo:flo, fhi: fhi]} ->
        {"cmd":"getEnsemble", "segy":
                              {ns:nsamps, dt:dt: traces:[trc1, trc2...]}}
    """
    print('msgJ: {}'.format(msgJ))
    if msgJ['cmd'].lower() == 'getsegyhdrs':
        filename = msgJ['filename']
        print('getting segyhdr >{}<, filename: {}'.format(msgJ, filename))

        t0 =datetime.now()
        if segy.filename != filename:
            # new file - open it
            try:
                s = _read_su(filename, endian='>', headonly=True)
                segy.filename = filename
                segy.segyfile = s
            except:
                ret = json.dumps({"cmd":"readSegy", "error": "Error reading file {}".format(filename)})
                return ret
            print("ntrcs = {}".format(len(segy.segyfile.traces)))

        hdrs = [segy.getTrc(i, headonly=True) for i in range(len(segy.segyfile.traces))]
        nsamps = segy.segyfile.traces[0].header.number_of_samples_in_this_trace
        dt = segy.segyfile.traces[0].header.sample_interval_in_ms_for_this_trace/(1000.*1000.)
        segy.nsamps = nsamps
        segy.dt = dt
        segy.hdrs = hdrs

        ret = json.dumps({"cmd": "getSegyHdrs",
                          "segyHdrs" : json.dumps({"dt":dt, "ns":nsamps,
                                               "filename": segy.filename,
                                               "hdrs":hdrs})})
        return ret

    if msgJ['cmd'].lower() == 'getnmo':
        # assumes getSegyHdrs called already.  needed?
        print('nmo getting ens', msgJ)

        if segy.segyfile is None:
            ret = json.dumps({"cmd":"getNMO", "error": "Error doing NMO: call getSegyHdrs first."})
            return ret

        try:
            vnmo = msgJ['vnmo']
            tnmo = msgJ['tnmo']
            print('got nmo', vnmo, tnmo)
        except:
            vnmo = 'vnmo=2000'
            tnmo = 'tnmo=0'

        try:
            ens = int(msgJ['ensemble'])
            try:
                # open a tmp file
                tmpf = tempfile.NamedTemporaryFile(delete=False) # output
                print('opened', tmpf.name)
                # and the segy input file
                with open(msgJ['filename'], 'rb') as sf: # input
                    # and do the nmo
                    ret = sp.call(['sunmo', vnmo, tnmo], stdin=sf, stdout=tmpf)
                    #print('nmo call', ret)
                    tmpf.close()

                # nmo segy file
                nsegy = Segy()
                nsegy.filename = tmpf.name
                nsegy.segyfile = _read_su(tmpf.name, headonly=False)
                nmontrcs = len(nsegy.segyfile.traces)
                #print('nmo ntrcs', nmontrcs)
                nmotrcs = [nsegy.getTrc(i, headonly=False, trctype='seismic') for i in range(nmontrcs)]
                # delete the tmp file
                os.unlink(tmpf.name)
                print('nmo trcs', len(nmotrcs))
            except:
                print('err nmo', ens)
                ret = json.dumps({"cmd":"getNMO", "error": "Error performing NMO"})
                return ret

            ntrc = len(nmotrcs)
        except:
            print('err ens', msgJ)
            ret = json.dumps({"cmd":"getNMO", "error": "Error reading ensemble number"})
            return ret
        print("ens = {} ntrc={}".format(ens, len(nmotrcs)))
        # dt/nsamps could change from the original due to decimation
        dt = nmotrcs[0]["dt"]
        nsamps = nmotrcs[0]["nsamps"]
        print('dt, nsamps', dt, nsamps)
        #print(json.dumps(traces[0]))
        ret = json.dumps({"cmd": "getNMO",
                          "NMO" : json.dumps({"dt":dt, "ns":nsamps,
                                               "filename": nsegy.filename,
                                               "traces":nmotrcs})})
        return ret

    if msgJ['cmd'].lower() == 'getvelan':
        if segy.segyfile is None:
            ret = json.dumps({"cmd":"getEnsemble", "error": "Error reading ensemble"})
            return ret
        try:
            ens = int(msgJ['ensemble'])
            print('in velan', ens)
        except:
            print('no ens')
            return json.dumps({"cmd":"getVelan", "error": "Error reading ensemble number"})

        try:
            dv = msgJ['dv']
            fv = msgJ['fv']
            nv = msgJ['nv']
        except:
            fv=1500
            dv=100
            nv=50

        dvstr = "dv={}".format(dv)
        fvstr = "fv={}".format(fv)
        nvstr = "nv={}".format(nv)

        tmpf = tempfile.NamedTemporaryFile(delete=False) # output
        with open(segy.filename, 'rb') as sf:# input
            #tmpfname = tmpf.name
            ret = sp.call(['suvelan', dvstr, fvstr, nvstr], stdin=sf, stdout=tmpf)
            print('wrote suvelan file', ret, tmpf.name)
            tmpf.close()

        vsegy = Segy()
        vsegy.filename=tmpf.name
        vsegy.segyfile = _read_su(tmpf.name, headonly=False)
        vtrcs = [vsegy.getTrc(i, headonly=False, trctype='velocity', v0=fv, dv=dv) for i in range(len(vsegy.segyfile.traces)) if vsegy.segyfile.traces[i].header.ensemble_number == ens]
        print('nvel trcs', len(vtrcs))

        dt = vtrcs[0]["dt"]
        nsamps = vtrcs[0]["nsamps"]
        print('dt, nsamps', dt, nsamps)
        #print(json.dumps(traces[0]))
        ret = json.dumps({"cmd": "getVelan",
                          "velan" : json.dumps({"dt":dt, "ns":nsamps,
                                               "filename": vsegy.filename,
                                               "traces":vtrcs})})
        #ret = json.dumps({"cmd": "velan", "velan": "test"})
        return ret

    if msgJ["cmd"].lower() == "gethello":
        ret = json.dumps({"cmd": "hello", "hello": "world"})
        return ret

#async def api(ws, path):
# all this is stolen from the websockets tutorial.
@asyncio.coroutine
def api(ws, path):
    while True:
        try:
#            msg = await ws.recv()
            # get a websockets string
            msg = yield from ws.recv()
            print('msg', msg)
            try:
                msgJ = json.loads(msg)
            except ValueError:
                print("error decoding msg >{}<".format(msg))
                continue

            #print("got json msgJ >{}<".format(msgJ))
            # and handle it...
            retJ = handleMsg(msgJ)

            #print(retJ)
            # and return the response to the client
            yield from ws.send(retJ)
            #            await ws.send(retJ)

        except websockets.ConnectionClosed:
            print('connection closed')
            return

segy = Segy()
#print(segy)

ss = websockets.serve(api, 'localhost', 9191)
# all this is stolen from the websockets tutorial.
try:
    print("ready...")
    sys.stdout.flush()
    asyncio.get_event_loop().run_until_complete(ss)
    asyncio.get_event_loop().run_forever()
except KeyboardInterrupt:
    print("bye")
