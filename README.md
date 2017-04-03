# d3-velan

A d3-based velocity analysis tool.

This tool allows one to _pick_ the RMS velocity from a semblance
plot (estimate of reflection power as a function of time and velocity)
and save the picks to a text file.  The semblance and NMO-corrected
CDP display are both displayed.

NMO - Normal moveout.  The travel time through the velocity model.
CDP - Common depth point (also known as CMP or common midpoint) gather.

## velServer - a python script to provide data

The semblance calculation and the NMO corrections are done in `velServer.py`
by SU (http://www.cwp.mines.edu/cwpcodes) and provided to `d3-velan` through
websockets.

*You must start velServer manually*

## Installation

Download nwjs  (http://nwjs.io)

Install `node` (http://nodejs.org), which includes `npm` (the node
package manager)

Install `bower` (another package manager(?))

    npm install bower -g

    git clone https://github.com/sanandak/d3-su-picker
    cd d3-su-picker
    # install the required packages
    bower install
    npm install

Install python3 3.5 or less (preferably through anaconda (http://continuum.io))

    conda config --add channels conda-forge
    conda install obspy
    conda install websockets

Install SU (http://www.cwp.mines.edu/cwpcodes) and make sure `$CWPROOT/bin` is in the path.

## Requirements

  These are installed by `npm` and `bower`
  - d3js v4
  - sprintf-js
  - angularjs

  These are installed by `conda` (`pip` may work - untested)
  - obspy
  - websockets
  - numpy and scipy are installed with obspy

## Usage

    cd $HOME/.../d3-velan
    python ./velServer.py
    /path/to/nwjs .

Buttons to open an SU file and to save velocity picks.

The viewer displays the semblance plot for the
first _ensemble_ (by default, the first `cdp` location).
Click on the semblace plot to pick time-velocity pairs to construct
a velocity model.  The `cdp` gather is NMO corrected to that model.

The saved picks file is a JSON file that is an array of traces.
- sufile: file name of the picked data
- picktime: when the picking was done
- picks: an array of picks (`{t:..., v:..., a:...}`)

## TODO

  - Read SEG-Y files.
  - Read pick files.
  - populate pick file more fully
