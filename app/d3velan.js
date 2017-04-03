var sprintf = require('sprintf-js').sprintf;

angular.module('psvelApp')
.directive('d3Velan', [function() {
  function link(scope, element) {
    'use strict';
    var margins = {left: 50,right: 30,top: 30,bottom: 30},
      w = 400 - margins.left - margins.right,
      h = 600 - margins.top - margins.bottom;

    // semblance array is of the form {t:..., v:..., a:...}
    // where t is time, v is velocity, and a is semblance power
    var data = scope.data;
    console.log('in d3velan', data);

    var svg = d3.select(element[0])
        .append('svg')
        .attr('width', w + margins.left + margins.right)
        .attr('height', h + margins.top + margins.bottom)
        .append('g')
        .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

    var color = d3.interpolateRgb('red', 'blue');

    var vmin = d3.min(data, function(d) {return d.v;})
    var vmax = d3.max(data, function(d) {return d.v;})
    var velnest = d3.nest().key(function(d) {return d.v;}).entries(data);
    // velnest: [{key: v1, values:{t:, v:}}, {key: v2, values: {}}, ...]
    var nv = velnest.length; // number of velocities
    var dv = (vmax - vmin) / (nv-1);

    var nt = velnest[0].values.length; // each velocity has all the times...
    var tmin = velnest[0].values[0].t;
    var tmax = velnest[0].values[nt-1].t;
    var dt = (tmax-tmin)/ (nt-1);

    var vWidth = w/nv;
    var tWidth = h/nt;

    // offset the rect left/top edge so that the pixel is centered
    var vScale = d3.scaleLinear().range([0 + vWidth/2, w - vWidth/2]).domain([vmin, vmax]);
    var tScale = d3.scaleLinear().range([0 + tWidth/2, h - tWidth/2 ]).domain([tmin, tmax]);

    var vAxis = d3.axisTop(vScale);
    var tAxis = d3.axisLeft(tScale);

    // velocity picks...
    var vpicks = [];

    svg.append('g')
      .attr('class', 'axis x-axis')
      .call(vAxis.ticks(5));
    svg.append('g')
      .attr('class', 'axis y-axis')
      .call(tAxis.ticks(5))

    // calculate the max semblance value in the panel
    var amax = d3.max(data, function(d) {return d.a;}); // percentile?
    console.log('amax', amax);
    //amax = 1;

    // unique pick id - used for the d3 data join
    var pkId = 0;
    // to delete a pick, search for the nearest one...
    var bisectT = d3.bisector(function(d){return d.t;}).left;

    var velmap = svg.append('g')
      .selectAll('.vel')
      .data(data, function(d){return d.t +'_'+ d.v;})
      .enter()
      .append('rect')
      .attr('class', 'vel')
      .attr('x', function(d) {return vScale(d.v) - vWidth/2;})
      .attr('y', function(d) {return tScale(d.t) - tWidth/2;})
      .attr('width', vWidth)
      .attr('height', tWidth)
      .style('fill', function(d){return color(d.a/amax);})
      .on('mousemove', function(d){
        var m = d3.mouse(this);
        var mvel = Math.floor(vScale.invert(m[0] + vWidth/2) / dv) * dv;
        var tvel = Math.floor(tScale.invert(m[1] + tWidth/2) / dt) * dt;
        //console.log('mouse', mvel, tvel);

        var closest = data.filter(function(d) {
          return Math.abs(d.t-tvel)<dt && Math.abs(d.v-mvel)<dv;
        })
        //console.log('closest semblance: ', closest);
        var sembstr = '';
        if(closest.length > 0) {
          sembstr = sprintf('\nSemblance = %.3f', closest[0].a);
        }

        d3.select(this).classed('cell-hover', true);
        d3.select('#tooltip')
          .style('left', (d3.event.pageX+10) + 'px')
          .style('top', (d3.event.pageY+10) + 'px')
          .select('#value')
          .text(sprintf('Velocity: %.2f Time: %.3f %s', mvel, tvel, sembstr));
        d3.select('#tooltip').classed('hidden', false)
      })
      .on('mouseout', function() {
        d3.select(this).classed('cell-hover', false);
        d3.select('#tooltip').classed('hidden', true);
      })
      // pick the velocity
      .on('click', function() {
        var m = d3.mouse(this);
        // picked vel and time
        var mvel = vScale.invert(m[0] + vWidth/2);
        var tvel = Math.floor(tScale.invert(m[1] + tWidth/2) / dt) * dt;
        // if no picks, put in one at t=0
        if(vpicks.length === 0) {
          vpicks.push({v:mvel, t:0, pkid:0, a:0});
        }
        // see if we are re-picking a time...
        var idx;
        // shift to delete a pick
        if(d3.event.shiftKey) { // delete the nearest pick
          idx = bisectT(vpicks, tvel);
          console.log('found a pick', idx);
          if (idx >= 0) {
            vpicks.splice(idx,1);
          }
          // if we have deleted all the picks, excepth
          // for the zero-time one I inserted, clear the array.
          if(vpicks.length === 1) {vpicks = [];}
        } else { // no shift key - add/update a pick...
          // find the closest rect to get a
          var closest = data.filter(function(d) {
            return Math.abs(d.t-tvel)<dt && Math.abs(d.v-mvel)<dv;
          })
          var apicked;
          if(closest.length > 0) {
            apicked = closest[0].a;
          }

          // ok, see if this time has already been picked...
          idx = vpicks.map(function(d) {return d.t;})
            .indexOf(tvel);
          console.log('idx', idx, tvel, mvel);

          if (idx >=0) { // found it - update the pick...
            vpicks[idx].v = mvel;
            vpicks[idx].a = apicked;
          } else { // add a new pick
            vpicks.push({v: mvel, t: tvel, a: apicked, pkid: ++pkId});
          };

          // sort in time order
          if(vpicks.length > 1) {
            vpicks.sort(function(a,b){return a.t-b.t;})
            vpicks[0].v = vpicks[1].v;
          }
          //console.log('vpicks', vpicks);
        }
        // redraw the picks...
        var pts = mark.selectAll('.markpts')
          .data(vpicks, function(d) {return d.pkid;})

        pts.exit()
          .remove()
        pts.transition()
          .duration(750)
          .attr('cx', function(d) {console.log('tx', d);return vScale(d.v) - vWidth/2;})
          .attr('cy', function(d) {return tScale(d.t) - tWidth/2;})
        pts.enter()
          .append('circle')
          .attr('class', 'markpts')
          .attr('r', '3px')
          // on hover over a pick, make it big
          .on('mouseover', function() {d3.select(this).attr('r', '6px');})
          .on('mouseout', function() {d3.select(this).attr('r', '3px');})
          .attr('cx', function(d) {console.log('enter', d);return vScale(d.v) - vWidth/2;})
          .attr('cy', function(d) {return tScale(d.t) - tWidth/2;})

        // tell controller app about the vel picks
        scope.setpicks({picks: vpicks});

        // draw the line between picks.
        svg.selectAll('.markline')
          .datum(vpicks)
          .attr('d', markLineFn)

      }); // on click

    // put these on top of the color plot of rects
    var mark = svg.append('g')
      .attr('id', 'markPts')
      .attr('class', 'markpts')
    var markLine = svg.append('g')
      .append('path')
      .attr('class', 'markline')
    var markLineFn = d3.line()
      .x(function(d) {return vScale(d.v) - vWidth/2;})
      .y(function(d) {return tScale(d.t) - tWidth/2;})
  }

  return {
    link: link,
    restrict: 'E',
    scope: {
      data: '=',
      setpicks: '&'
    }
  }
}])
