var sprintf = require('sprintf-js').sprintf;

angular.module('psvelApp')
.directive('d3Velan', [function() {
  function link(scope, element) {
    'use strict';
    var margins = {left: 50,right: 30,top: 50, bottom: 30},
      w = 400 - margins.left - margins.right,
      h = 600 - margins.top - margins.bottom;

    // semblance array is of the form {t:..., v:..., a:...}
    // where t is time, v is velocity, and a is semblance power
    var data = scope.data.varr;
    console.log('in d3velan', data, scope.data.cdp, scope.data.ns, scope.data.fv);

    var svg = d3.select(element[0])
        .append('svg')
        .attr('width', w + margins.left + margins.right)
        .attr('height', h + margins.top + margins.bottom)
        .append('g')
        .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

    //var color = d3.scaleSequential(d3.interpolateWarm);
    var color = d3.scaleQuantize()
        .range(['#a50026','#d73027','#f46d43','#fdae61','#fee090','#e0f3f8','#abd9e9','#74add1','#4575b4','#313695'].reverse())
    var nv, dv, vmin, vmax, nt, dt, tmin, tmax;
    var vWidth, tWidth;
    var cdp;

    // offset the rect left/top edge so that the pixel is centered
    var vScale = d3.scaleLinear();
    var tScale = d3.scaleLinear();
    var vAxis = d3.axisTop(vScale);
    var tAxis = d3.axisLeft(tScale);


    // initially the tooltip is hidden.. when we mouseover, display it
    d3.select('#tooltip').classed('hidden', true);
    
    svg.append('text')
      .text('Velocity (<ft or m>/s)')
      .attr('x', w/2)
      .attr('text-anchor', 'middle')
      .attr('font', '12px sans-serif')
      .attr('dy', '-1.5em')


    // velocity picks...
    var allpicks = []; // [{cdp:.., picks:..}, {cdp:.., picks:..}...]

    svg.append('g')
      .attr('class', 'axis x-axis')
    svg.append('g')
      .attr('class', 'axis y-axis')

    // calculate the max semblance value in the panel
    //var amax = d3.max(data, function(d) {return d.a;}); // percentile?
    var amax = d3.quantile(data.sort(function(a,b) {
      return a.a-b.a;
    }), 0.99, function(d) {return d.a})
    console.log('amax', amax);
    //amax = 1;

    color.domain([0, amax])

    // unique pick id - used for the d3 data join
    var pkId = 0;
    // to delete a pick, search for the nearest one...
    var bisectT = d3.bisector(function(d){return d.t;}).left;

    var draw = function() {
      var vsel = svg.select('.velmapg')  //.selectAll('.velmapg')
      .selectAll('.vel')
      .data(data, function(d){return d.t +'_'+ d.v;})

      vsel
      .exit()
      .remove()

      vsel
      .attr('x', function(d) {return vScale(d.v) - vWidth/2;})
      .attr('y', function(d) {return tScale(d.t) - tWidth/2;})
      .attr('width', vWidth)
      .attr('height', tWidth)
      .style('fill', function(d){return color(d.a);})

      vsel
      .enter()
      .append('rect')
      .attr('class', 'vel')
      .attr('x', function(d) {return vScale(d.v) - vWidth/2;})
      .attr('y', function(d) {return tScale(d.t) - tWidth/2;})
      .attr('width', vWidth)
      .attr('height', tWidth)
      .style('fill', function(d){return color(d.a);})
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
          // tell app.js about the new mouse position
          scope.settv({tv: {t: closest[0].t, v: closest[0].v}});
          //scope.$apply()
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

        // shallow copy of the picks entry..
        var cdppicks = allpicks.find(function(d) {return d.cdp == cdp;});
        var vpicks = [];
        if(typeof cdppicks == 'undefined') {
          cdppicks = {cdp: cdp, picks: vpicks};
          allpicks.push(cdppicks);
        } else {
          vpicks = cdppicks.picks;
        }
        
        if(vpicks.length === 0) {
          vpicks.push({v:mvel, t:0, pkid:0, a:0, cdp:cdp});
        }
        // see if we are re-picking a time...
        var idx;
        // shift to delete a pick
        if(d3.event.shiftKey) { // delete the nearest pick after the mouse
          idx = bisectT(vpicks, tvel);
          console.log('found a pick', idx);
          if (idx >= 0) {
            vpicks.splice(idx,1);
          }
          // if we have deleted all the picks, except
          // for the zero-time one I inserted, clear the array.
          if(vpicks.length === 1) { vpicks = [];}
        } else { // no shift key - add/update a pick...
          // find the closest rect to get `a`
          var closest = data.filter(function(d) {
            return Math.abs(d.t-tvel)<dt && Math.abs(d.v-mvel)<dv;
          })
          var apicked=-1;
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
            vpicks.push({v: mvel, t: tvel, a: apicked, cdp: cdp, pkid: ++pkId});
          };

        }

        // sort in time order
        if(vpicks.length > 1) {
          vpicks.sort(function(a,b){return a.t-b.t;})
          vpicks[0].v = vpicks[1].v;
        }
        //console.log('vpicks', vpicks);

        // redraw the picks...
        var pts = mark.selectAll('.markpts')
          .data(vpicks.filter(function(d){return d.cdp==cdp;}),
            function(d) {return d.pkid;})

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
          .attr('cx', function(d) {return vScale(d.v) - vWidth/2;})
          .attr('cy', function(d) {return tScale(d.t) - tWidth/2;})

        // draw the line between picks.
        //console.log('vpicks', cdp, vpicks, vpicks.filter(function(d){return d.cdp == cdp;}));
        svg.selectAll('.markline')
          .datum(vpicks.filter(function(d) {return d.cdp == cdp;}))
          .attr('d', markLineFn)

        
        // tell controller app about the vel picks
        scope.setpicks({picks: allpicks});

      }); // on click


    }

    var velmap = svg.append('g')
      .attr('id', 'velmap')
      .attr('class', 'velmapg')

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

    //draw();

    function init() {
      nv = scope.data.nv;
      dv = scope.data.dv;
      vmin = scope.data.fv;
      vmax = vmin + dv * (nv - 1)

      nt = scope.data.ns;
      dt = scope.data.dt;
      tmin = 0; // FIXME
      tmax = tmin + dt * (nt - 1);

      cdp = scope.data.cdp;

      vWidth = w/nv;
      tWidth = h/nt;

      // offset the rect left/top edge so that the pixel is centered
      vScale.range([0 + vWidth/2, w - vWidth/2]).domain([vmin, vmax]);
      tScale.range([0 + tWidth/2, h - tWidth/2 ]).domain([tmin, tmax]);

      vAxis = d3.axisTop(vScale);
      tAxis = d3.axisLeft(tScale);

      svg.select('.x-axis')
        .call(vAxis.ticks(5))
      svg.select('.y-axis')
          .call(tAxis.ticks(5))

      // calculate the max semblance value in the panel
      //var amax = d3.max(data, function(d) {return d.a;}); // percentile?
      amax = d3.quantile(data.sort(function(a,b) {
        return a.a-b.a;
      }), 0.95, function(d) {return d.a})
      draw();

      // redraw the picks...
      var cdppicks = allpicks.find(function(d) {return d.cdp == cdp;});
      var vpicks;
      if(typeof cdppicks == 'undefined') {
        vpicks = [];
      } else {
        vpicks = cdppicks.picks;
      }
      var pts = mark.selectAll('.markpts')
        .data(vpicks, function(d) {return cdp + '_' + d.pkid;})

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
        .attr('cx', function(d) {return vScale(d.v) - vWidth/2;})
        .attr('cy', function(d) {return tScale(d.t) - tWidth/2;})

      svg.selectAll('.markline')
        .datum(vpicks.filter(function(d) {return d.cdp == cdp;}))
        .attr('d', markLineFn)


    }

    scope.$watch('data', function() {
      console.log('d3-velan in watch');
      data = scope.data.varr;
      init();
    })
  }

  return {
    link: link,
    restrict: 'E',
    scope: {
      data: '=',
      setpicks: '&',
      settv: '&'
    }
  }
}])
