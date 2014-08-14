var sys   = require('sys')
var spawn = require('child_process').spawn;
var gui   = require('nw.gui');
var win   = gui.Window.get();

/* do everything needed to startup */
function init() {
  /* add eventhandler for clear button */
  $("#proctablefilterclear").click(function() {
    $("#proctablefilter").val('');
    refilterTopTable('');
  });

  /* add eventhandler for input field */
  $("#proctablefilter").keyup(function() {
    refilterTopTable($("#proctablefilter").val());
  });

  $("#backimg").click(function() {
    if(topChild) { topChild.kill(); }
    lastPid = undefined;
    $('#graphtable').hide();
    $('#backimg').hide();
    $("#tooltip").hide();
    $('#procpanel').show();
    spawnTop(updateTopTable);
  });

  win.on('resize', function() {
    if(lastPid) {
      plot.resize();
      plot.draw();
    }
  });

  spawnTop(updateTopTable);
  return;
}

/* filter top output */
function refilterTopTable(filter) {
  $('#proctable tbody tr').each(function(i, row) {
    var line = row.getAttribute('alt');
    if(!filter || line.match(filter)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

var lastOutput = "";
function updateTopTable(stdout) {
  stdout     = lastOutput + stdout;
  var lines  = stdout.split(/\n/);
  lastOutput = "";

  var filter = $('#proctablefilter').val();

  for(var i=0, len=lines.length; i<len; i++) {
    var data = parseTopOutput(lines[i]);
    if(data) {
      var display = (!filter || data.line.match(filter)) ? '' : 'none';
      $('#proctable tbody').append('<tr class="clickable" onclick="startGraphing('+data.pid+')" alt="'+data.line+'" style="display:'+display+';">'
                                    +'<td class="pid">'+data.pid+'</td>'
                                    +'<td class="user">'+data.user+'</td>'
                                    +'<td class="pr">'+data.pr+'</td>'
                                    +'<td class="ni">'+data.ni+'</td>'
                                    +'<td class="virt">'+data.virt+'</td>'
                                    +'<td class="res">'+data.res+'</td>'
                                    +'<td class="shr">'+data.shr+'</td>'
                                    +'<td class="s">'+data.s+'</td>'
                                    +'<td class="cpu">'+data.cpu+'</td>'
                                    +'<td class="mem">'+data.mem+'</td>'
                                    +'<td class="time">'+data.time+'</td>'
                                    +'<td class="command">'+data.command+'</td>'
                                    +'</tr>');
    }
    if(procRollover) {
      // empty table first
      $("#proctable td").parent().remove();
      procRollover = false;
    }
  }
  $.bootstrapSortable(true);
}

/* parse single line from top output */
var procStarted  = false;
var procRollover = false;
function parseTopOutput(line) {
  line = line.replace(/^\s+/g, '');
  line = line.replace(/\s+$/g, '');

  if(line.match(/^\s*top\s*/)) {
    procStarted = false;
  }
  if(procStarted && !line.match(/^\s*$/)) {
    var data = line.split(/\s+/g);
    if(!data[11]) {
      return;
    }
    var hash     = {};
    hash.line    = line;
    hash.pid     = data.shift();
    hash.user    = data.shift();
    hash.pr      = data.shift();
    hash.ni      = data.shift();
    hash.virt    = normalizeMemVal(data.shift());
    hash.res     = normalizeMemVal(data.shift());
    hash.shr     = normalizeMemVal(data.shift());
    hash.s       = data.shift();
    hash.cpu     = data.shift();
    hash.mem     = data.shift();
    hash.time    = data.shift();
    hash.command = data.join(' ');
    return(hash);
  }
  if(line.match(/^\s*PID\s+USER/)) {
    procStarted  = true;
    procRollover = true;
  }
  return;
}

var topChild = false;
function spawnTop(callback, extra_options) {
  if(topChild) { topChild.kill(); }

  var options = ['-b', '-c'];
  if(extra_options) { options = options.concat(extra_options); }
  topChild = spawn('top', options, {env: {'COLUMNS': 1000}});

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
    $('#proctable tbody').append('<tr>'
                                +'<td colspan=12><pre class="error">%> top '+options.join(' ')+'<br>'+data+'</pre></td>'
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

/* normalize memory value */
function normalizeMemVal(val) {
  var m = String(val).match(/^(\d+)([a-z])$/);
  if(m && m[1]) {
    val = Number(m[1]);
    if(m[2] == 'm') { val = val * 1024; }
    if(m[2] == 'g') { val = val * 1024 * 1024; }
  }
  return(val);
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
  spawnTop(graphTopOutput, ['-d', '0.5', '-p', pid]);
}

function graphTopOutput(stdout) {
  stdout = lastOutput + stdout;
  var lines = stdout.split(/\n/);
  lastOutput = "";

  var date      = new Date();
  var timestamp = date.getTime();
  for(var i=0, len=lines.length; i<len; i++) {
    var data = parseTopOutput(lines[i]);
    if(data) {
      /* remove pseudo entry */
      series[0].data.pop();

      /* add real data */
      series[0].data.push([timestamp, data.virt]);  // virt
      series[1].data.push([timestamp, data.res ]);  // res
      series[2].data.push([timestamp, data.shr ]); // shr
      series[3].data.push([timestamp, data.cpu ]); // cpu

      /* advance to next minute to remove flickering */
      var nextstep = timestamp - timestamp % 60000 + 60000;
      series[0].data.push([nextstep, undefined]);

      $('#pid').html(data.pid);
      $('#user').html(data.user);
      $('#prio').html(data.pr);
      $('#nice').html(data.ni);
      $('#virt').html(formatKiB(data.virt)+" ("+data.virt+"KiB)");
      $('#res').html(formatKiB(data.res)+" ("+data.res+"KiB)");
      $('#shr').html(formatKiB(data.shr)+" ("+data.shr+"KiB)");
      $('#s').html(data.s);
      $('#cpu').html(data.cpu+" %");
      $('#mem').html(data.mem+" %");
      $('#time').html(data.time);
      $('#command').html(data.command);

      /* check series visibility */
      drawVisibleSeries(nextstep);

      return;
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