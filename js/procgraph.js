var sys   = require('sys')
var spawn = require('child_process').spawn;
var gui   = require('nw.gui');
var win   = gui.Window.get();

/* do everything needed to startup */
function init() {
  /* add eventhandler for clear button */
  $("#proctablefilterclear").click(function() {
    $("#proctablefilter").val('');
  });

  /* add eventhandler for input field */
  $("#proctablefilter").keyup(function() {
    update_proctable(parse_top_output);
  });

  $("#backimg").click(function() {
    $('#procpanel').show();
    $('#graphtable').hide();
    $('#backimg').hide();
    if(topChild) { topChild.kill(); }
    lastPid = undefined;
    update_proctable(parse_top_output);
  });

  win.on('resize', function() {
    if(lastPid) {
      plot.resize();
      plot.draw();
    }
  });

  update_proctable(parse_top_output);
  return;
}

var proc_started = false;
var lastOutput = "";
function parse_top_output(stdout) {
  stdout = lastOutput + stdout;
  var lines = stdout.split(/\n/);
  lastOutput = "";

  var filter = $('#proctablefilter').val();

  for(var i=0, len=lines.length; i<len; i++) {
    var line = lines[i];
    line = line.replace(/^\s+/g, '');

    if(line.match(/^\s*top\s*/)) {
      proc_started = false;
    }

    if(proc_started && !line.match(/^\s*$/) && (!filter || line.match(filter))) {
      var data = line.split(/\s+/g);
      if(!data[11]) {
        return;
      }
      $('#proctable tbody').append('<tr class="clickable" onclick="startGraphing('+data[0]+')">'
                                    +'<td class="pid">'+data.shift()+'</td>'
                                    +'<td class="user">'+data.shift()+'</td>'
                                    +'<td class="pr">'+data.shift()+'</td>'
                                    +'<td class="ni">'+data.shift()+'</td>'
                                    +'<td class="virt">'+data.shift()+'</td>'
                                    +'<td class="res">'+data.shift()+'</td>'
                                    +'<td class="shr">'+data.shift()+'</td>'
                                    +'<td class="s">'+data.shift()+'</td>'
                                    +'<td class="cpu">'+data.shift()+'</td>'
                                    +'<td class="mem">'+data.shift()+'</td>'
                                    +'<td class="time">'+data.shift()+'</td>'
                                    +'<td class="command">'+data.join(' ')+'</td>'
                                    +'</tr>');
    }
    if(line.match(/^\s*PID\s+USER/)) {
      proc_started = true;
      // empty table first
      $("#proctable td").parent().remove();
    }
  }
  $.bootstrapSortable(true);
}

var topChild = false;
function update_proctable(callback, extra_options) {
  if(topChild) { topChild.kill(); }
  var options = ['-b', '-w', '1000', '-c'];
  if(extra_options) { options = options.concat(extra_options); }
  topChild = spawn('top', options);
  if(!topChild) {
    console.log("failed to launch top");
    topChild = false;
    return;
  }
  topChild.stdout.setEncoding('utf8');
  topChild.stdout.on('data', function (data) {
    //console.log('stdout: ' + data);
    callback(data.toString());
  });
  topChild.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
    $("#proctable td").parent().remove();
    $('#proctable tbody').append('<tr class="error">'
                                +'<td colspan=11>'+data+'</td>'
                                +'</tr>');
  });
  topChild.on('close', function (code) {
    if(code != 0) {
      console.log('child process exited with code ' + code);
    }
  });
}

var plot, series, graph_interval, lastPid;
var d1 = [], d2 = [], d3 = [], d4 = [];
var graphVisibility = { virt: true, res: true, shr: true, cpu: true };
function startGraphing(pid) {
  if(topChild) { topChild.kill(); }
  $('#procpanel').hide();
  $('#graphtable').show();
  $('#backimg').show();

  if(lastPid != undefined && lastPid != pid) {
    // reset series
    d1 = [];
    d2 = [];
    d3 = [];
    d4 = [];
    graphVisibility = { virt: true, res: true, shr: true, cpu: true };
  }
  lastPid = pid;

  var s1 = {
    label: "virt",
    color: "#edc240",
    data: d1,
    yaxis: 2
  };
  var s2 = {
    label: "res",
    color: "#afd8f8",
    data: d2,
    yaxis: 2
  };
  var s3 = {
    label: "shr",
    color: "#cb4b4b",
    data: d3,
    yaxis: 2
  };
  var s4 = {
    label: "cpu",
    color: "#4da74d",
    data: d4
  };
  var options = {
    xaxis: { mode: "time" },
    yaxes: [ { // left cpu axis
               min: 0,
               max: 100,
               tickFormatter: function(val, axis) { return(val+"%"); }
              },
              { // right size axis
               min: 0,
               tickFormatter: formatKiB,
               position: "right",
               alignTicksWithAxis: 1
              }
          ],
    grid: {
      hoverable: true,
    },selection: {
      mode: "x"
    }
  };
  series = [s1, s2, s3, s4];
  plot = $.plot('#procgraph', series, options);
  updateGraph(pid);

  /* graph hover */
  $("#procgraph").bind("plothover", function (event, pos, item) {
    if (item) {
      var x = new Date(item.datapoint[0]),
          y = item.datapoint[1];

      var val;
      if(item.series.label == 'cpu') {
        val = y+'%';
      } else {
        val = formatKiB(y);
      }

      $("#tooltip").html(x.toGMTString() + ": " + item.series.label + " = " + val)
                   .css({top: item.pageY+5, left: item.pageX+5})
                   .fadeIn(200);
    } else {
      $("#tooltip").hide();
    }
  });

  /* enable zooming */
  $("#procgraph").bind("plotselected", function (event, ranges) {
    $.each(plot.getXAxes(), function(_, axis) {
      var opts = axis.options;
      opts.min = ranges.xaxis.from;
      opts.max = ranges.xaxis.to;
    });
    plot.setupGrid();
    plot.draw();
    plot.clearSelection();
  });
  /* reset zoom on rightclick */
  $("#procgraph").bind("contextmenu", function (event, pos, item) {
    $.each(plot.getXAxes(), function(_, axis) {
      var opts = axis.options;
      opts.min = undefined;
      opts.max = undefined;
    });
  });
}

/* format KiB value to human readable */
function formatKiB(val) {
  val = val * 1024;
  // value is in KiB initially
  if(val > 1073741824)
    return (val / 1073741824).toFixed(1) + " GB";
  else if (val > 1048576)
    return (val / 1048576).toFixed(0) + " MB";
  else if (val > 1024)
    return (val / 1024).toFixed(0) + " KB";
  else
    return val.toFixed(0) + " B";
}


function updateGraph(pid) {
  update_proctable(graph_top_output, ['-d', '0.5', '-p', pid]);
}

function graph_top_output(stdout) {
  stdout = lastOutput + stdout;
  var lines = stdout.split(/\n/);
  lastOutput = "";

  var date      = new Date();
  var timestamp = date.getTime();
  for(var i=0, len=lines.length; i<len; i++) {
    var line = lines[i];

    if(line.match(/^\s*top\s*/)) {
      proc_started = false;
    }

    if(proc_started && !line.match(/^\s*$/)) {
      line = line.replace(/^\s+/g, '');
      var data = line.split(/\s+/g);
      if(!data[11]) {
        return;
      }
      /* remove pseudo entry */
      series[0].data.pop();

      /* add real data */
      series[0].data.push([timestamp, Number(data[4])]); // virt
      series[1].data.push([timestamp, Number(data[5])]); // res
      series[2].data.push([timestamp, Number(data[6])]); // shr
      series[3].data.push([timestamp, Number(data[8])]); // cpu

      /* advance to next minute to remove flickering */
      var nextstep = timestamp - timestamp % 60000 + 60000;
      series[0].data.push([nextstep, undefined]);

      $('#pid').html(data[0]);
      $('#user').html(data[1]);
      $('#prio').html(data[2]);
      $('#nice').html(data[3]);
      $('#virt').html(formatKiB(data[4])+" ("+data[4]+"KiB)");
      $('#res').html(formatKiB(data[5])+" ("+data[5]+"KiB)");
      $('#shr').html(formatKiB(data[6])+" ("+data[6]+"KiB)");
      $('#s').html(data[7]);
      $('#cpu').html(data[8]+" %");
      $('#mem').html(data[9]+" %");
      $('#time').html(data[10]);
      $('#command').html(data[11]);

      /* check series visibility */
      drawVisibleSeries(nextstep);

      return;
    }
    if(line.match(/^\s*PID\s+USER/)) {
      proc_started = true;
    }
  }
}

function adjustCpuAxisMaxValue() {
  var newmax = Math.ceil(plot.getYAxes()[0].datamax / 100)*100;
  if(newmax < 100) { newmax = 100; }
  plot.getOptions().yaxes[0].max=newmax;
}

/* draw visible series */
function drawVisibleSeries(nextstep) {
  /* adjust cpu axis */
  adjustCpuAxisMaxValue();

  var tmpseries = [series[0], series[1], series[2], series[3]];
  if(!graphVisibility['virt']) { tmpseries[0] = { label: "virt", color: '#FFFFFF', data: [[nextstep, undefined]] }; }
  if(!graphVisibility['res'])  { tmpseries[1] = { label: "res",  color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['shr'])  { tmpseries[2] = { label: "shr",  color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['cpu'])  { tmpseries[3] = { label: "cpu",  color: '#FFFFFF', data: [] }; }

  plot.setData(tmpseries);
  plot.setupGrid();
  plot.draw();

  /* make legend boxes clickable */
  $('.legendColorBox').click(function() {
    graphVisibility[this.nextSibling.innerHTML] = !graphVisibility[this.nextSibling.innerHTML];
    drawVisibleSeries(nextstep);
    adjustCpuAxisMaxValue();
    drawVisibleSeries(nextstep);
  }).addClass("clickable");
  $('TD.legendLabel').css({paddingLeft: "5px"});
}

/* support opening external urls in default browser */
function supportExternalLinks(event) {
  var href;
  var isExternal = false;
  function crawlDom(element) {
    if (element.nodeName.toLowerCase() === 'a') {
      href = element.getAttribute('href');
    }
    if (element.classList.contains('js-external-link')) {
      isExternal = true;
    }
    if (href && isExternal) {
      gui.Shell.openExternal(href);
      event.preventDefault();
    } else if (element.parentElement) {
      crawlDom(element.parentElement);
    }
  }
  crawlDom(event.target);
}
document.body.addEventListener('click', supportExternalLinks, false);