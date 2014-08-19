var sys     = require('sys')
var child   = require('child_process');
var spawn   = child.spawn;
var exec    = child.exec;
var gui     = require('nw.gui');
var win     = gui.Window.get();
var version = gui.App.manifest.version

/* do everything needed to startup */
function init() {
  $('#version').text('v'+version);

  /* add eventhandler for clear button */
  $("#proctablefilterclear").click(function() {
    $("#proctablefilter").val('');
    refilterTopTable('');
  });
  $("#sshbtn").click(function() {
    if($('#sshbtn').text() == "disconnect") {
      $('#sshhost').val('');
      $('#sshbtn').text('connect');
    }
    spawnTop(updateTopTable);
  });

  /* add eventhandler for input field */
  $("#proctablefilter").keyup(function() {
    refilterTopTable($("#proctablefilter").val());
  });

  $("#backimg").click(function() {
    if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
    lastPid    = undefined;
    lastFilter = undefined;
    $('#graphtable').hide();
    $('#backimg').hide();
    $("#tooltip").hide();
    $("#proctable td").parent().remove();
    $('#procpanel').show();
    spawnTop(updateTopTable);
  });

  $("#filterbtn").click(function() {
    startGraphing(undefined, $("#proctablefilter").val());
  });

  win.on('resize', function() {
    if(lastPid || lastFilter) {
      plot.resize();
      plot.draw();
    }
  });

  /* clean up */
  win.on('close', function() {
    /* make sure all top processes are done */
    child = exec('ps -efl | grep top | grep '+process.pid+' | awk \'{ print $1 }\' | xargs kill');
    this.close(true);
  });

  console.log(gui.App.argv);
  if(gui.App.argv.length > 0) {
    var val = gui.App.argv[0];
    if(String(val).match(/^\d+$/)) {
      startGraphing(val);
    } else {
      $("#proctablefilter").val(val);
      startGraphing(undefined, val);
    }
  } else {
    spawnTop(updateTopTable);
  }
  return;
}

/* filter top output */
function refilterTopTable(filter) {
  var pattern;
  if(filter) { pattern = new RegExp(filter, 'i'); }
  $('#proctable tbody tr').each(function(i, row) {
    var line = row.getAttribute('alt');
    if(line) {
      if(!pattern || line.match(pattern)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    }
  });
}

function updateTopTable(data) {
  var filter = $('#proctablefilter').val();
  var pattern;
  if(filter) { pattern = new RegExp(filter, 'i'); }

  // empty table first
  $("#proctable td").parent().remove();
  for(var i=0, len=data.length; i<len; i++) {
    var row = data[i];
    var display = (!pattern || row.line.match(pattern)) ? '' : 'none';
    $('#proctable tbody').append('<tr class="clickable" onclick="startGraphing('+row.pid+')" alt="'+row.line+'" style="display:'+display+';">'
                                  +'<td class="pid">'+row.pid+'</td>'
                                  +'<td class="user">'+row.user+'</td>'
                                  +'<td class="pr">'+row.pr+'</td>'
                                  +'<td class="ni">'+row.ni+'</td>'
                                  +'<td class="virt">'+row.virt+'</td>'
                                  +'<td class="res">'+row.res+'</td>'
                                  +'<td class="shr">'+row.shr+'</td>'
                                  +'<td class="s">'+row.s+'</td>'
                                  +'<td class="cpu">'+row.cpu+'</td>'
                                  +'<td class="mem">'+row.mem+'</td>'
                                  +'<td class="time">'+row.time+'</td>'
                                  +'<td class="command">'+row.command+'</td>'
                                  +'</tr>');
  }
  $.bootstrapSortable(true);
}

/* parse single line from top output */
var lastOutput = "";
function parseTopOutputStream(streamdata, callback) {
  if((streamdata.match(/^\s*top\s*/) || streamdata.match(/^Processes:/)) && !lastOutput.match(/^\s*$/)) {
    var procStarted = false;
    var currentProcs = [];
    var lines  = lastOutput.split(/\n+/g);
    lastOutput = "";
    for(var i=0, len = lines.length; i<len; i++) {
      var line = lines[i];
      if(line.match(/^\s*top\s*/) || line.match(/^Processes:/)) {
        var procStarted = false;
        var currentProcs = [];
      }
      line = line.replace(/^\s+/g, '');
      line = line.replace(/\s+$/g, '');
      var data = line.split(/\s+/g);
      if(procStarted) {
        var hash = {};
        if(curSyntax == 0) {
          if(!data[11]) { continue; }
          hash.line    = line;
          hash.pid     = data.shift();
          hash.user    = data.shift();
          hash.pr      = data.shift();
          hash.ni      = data.shift();
          hash.virt    = normalizeMemVal(data.shift(), line);
          hash.res     = normalizeMemVal(data.shift(), line);
          hash.shr     = normalizeMemVal(data.shift(), line);
          hash.s       = data.shift();
          hash.cpu     = data.shift();
          hash.mem     = data.shift();
          hash.time    = data.shift();
          hash.command = data.join(' ');
          currentProcs.push(hash);
        }
        if(curSyntax == 1) {
          if(!data[6]) { continue; }
          hash.line    = line;
          hash.pid     = Number(String(data.shift()).replace(/\-$/, ''));
          hash.user    = data.shift();
          hash.pr      = '';
          hash.ni      = '';
          hash.s       = data.shift();
          hash.cpu     = data.shift();
          hash.res     = normalizeMemVal(data.shift(), line);
          hash.time    = data.shift();
          hash.virt    = '';
          hash.shr     = '';
          hash.mem     = '';
          hash.command = data.join(' ');
          currentProcs.push(hash);
        }
        if(hash.cpu > 10000) {
          console.log("skipped broken cpu value in");
          console.log(line);
          return;
        }
      }
      if(line.match(/^\s*PID\s+USER/)) {
        procStarted  = true;
      }
    }
    callback(currentProcs);
  }
  lastOutput += streamdata;
  return;
}

var topChild = false, curSyntax = 0;
function spawnTop(callback, interval, pid, altSyntax, filter) {
  $('#sshbtn').text('connect');
  if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
  if(altSyntax == undefined) { altSyntax = 0; }
  curSyntax    = altSyntax;

  var standardArgs = ['-b', '-c'];
  if(altSyntax == 1) {
    /* osx top is crappy */
    standardArgs = ['-l', '0', '-stats', 'pid,user,state,cpu,mem,time,command', '-F', '-R' ];
  }

  var ssh     = $("#sshhost").val(),
      command = false,
      args    = [],
      options = {},
      fullcmd = '';
  if(ssh) {
    /* remote top */
    $('#sshbtn').text('disconnect');
    args    = [ ssh, '-o', 'BatchMode=yes', 'COLUMNS=1000 top'];
    command = 'ssh';
  } else {
    /* local top */
    command = 'top';
    options = {env: {'COLUMNS': 1000}};
  }
  args = args.concat(standardArgs);
  if(altSyntax == 0) {
    if(interval) { args.push('-d', interval); }
    if(pid)      { args.push('-p', pid); }
  }
  if(altSyntax == 1) {
    interval = Math.round(interval); /* only supports integer */
    if(interval) { args.push('-i', (interval < 1 ? 1 : interval)); }
    if(pid)      { args.push('-pid', pid); }
  }

  lastOutput = "";
  topChild   = spawn(command, args, options);
  fullcmd    = command+' '+args.join(' ');

  console.log("spawned["+topChild.pid+"]: "+fullcmd);
  if(!topChild) {
    console.log("failed to launch top");
    topChild = false;
    return;
  }
  topChild.stdout.setEncoding('utf8');
  topChild.stdout.on('data', function (data) {
    //console.log('stdout: ' + data);
    parseTopOutputStream(data.toString(), callback);
  });
  topChild.stderr.on('data', function (data) {
    if(data.toString().match(/invalid option or syntax/)) {
      spawnTop(callback, interval, pid, ++altSyntax, filter);
      return;
    }
    console.log('stderr: ' + data);
    $("#proctable td").parent().remove();
    $('#proctable tbody').append('<tr>'
                                +'<td colspan=12><pre class="error">%>'+fullcmd+'<br>'+data+'</pre></td>'
                                +'</tr>');
  });
  topChild.on('close', function (code) {
    if(code != 0) {
      console.log('['+this.pid+'] child process exited with code ' + code);
    }
  });
}

var plot, series, graph_interval, lastPid, lastFilter;
var graphVisibility = { virt: true, res: true, shr: true, cpu: true, matches: true };
var rawdata = [[],[],[],[],[]];
var isZoomed = false;
function startGraphing(pid, filter) {
  $('#procpanel').hide();
  $('#graphtable').show();
  $('#backimg').show();

  var reset = false;
  if(pid && (lastPid == undefined || lastPid != pid)) {
    reset = true;
  }
  if(filter != undefined && (lastFilter == undefined || lastFilter != filter)) {
    reset = true;
  }
  if(reset) {
    // reset series
    reset           = false;
    rawdata         = [[],[],[],[],[]];
    graphVisibility = { virt: true, res: true, shr: true, cpu: true, matches: true };
    duplicateData   = false;
  }
  lastPid    = pid;
  lastFilter = filter;

  var s1 = {
    nr:    0,
    label: "virt",
    color: "#edc240",
    data: rawdata[0],
    yaxis: 2
  };
  var s2 = {
    nr:    1,
    label: "res",
    color: "#afd8f8",
    data: rawdata[1],
    yaxis: 2
  };
  var s3 = {
    nr:    2,
    label: "shr",
    color: "#cb4b4b",
    data: rawdata[2],
    yaxis: 2
  };
  var s4 = {
    nr:    3,
    label: "cpu",
    color: "#4da74d",
    data: rawdata[3]
  };
  var s5 = {
    nr:    4,
    label: "matches",
    color: "#9440ed",
    data: rawdata[4]
  };
  var options = {
    xaxis: { mode: "time",
             timezone: "browser"
    },
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
  series = [s1, s2, s3, s4, s5];
  plot = $.plot('#procgraph', series, options);
  updateGraph(pid, filter);

  /* graph hover */
  $("#procgraph").bind("plothover", function (event, pos, item) {
    if (item) {
      var x = new Date(item.datapoint[0]),
          y = item.datapoint[1];

      var val;
      if(item.series.label == 'cpu') {
        val = y+'%';
      } else if(item.series.label == 'matches') {
        val = '#' + y;
      } else {
        val = formatKiB(y);
      }

      $("#tooltip").html(x + ": " + item.series.label + " = " + val)
                   .css({top: item.pageY+5, left: item.pageX+5})
                   .fadeIn(200);
    } else {
      $("#tooltip").hide();
    }
  });

  /* enable zooming */
  $("#procgraph").bind("plotselected", function (event, ranges) {
    isZoomed = true;
    $.each(plot.getXAxes(), function(_, axis) {
      var opts = axis.options;
      opts.min = ranges.xaxis.from;
      opts.max = ranges.xaxis.to;
    });

    drawVisibleSeries();
    plot.clearSelection();
  });
  /* reset zoom on rightclick */
  $("#procgraph").bind("contextmenu", function (event, pos, item) {
    isZoomed = false;
    $.each(plot.getXAxes(), function(_, axis) {
      var opts = axis.options;
      opts.min = undefined;
      opts.max = undefined;
    });
    drawVisibleSeries();
  });
}

/* normalize memory value */
function normalizeMemVal(val, line) {
  var m;

  /* osx style */
  m = String(val).match(/^[\+\-]?(\d+)([A-Z])[\+\-]?$/);
  if(m) {
    val = Number(m[1]);
    if(m[2] == 'M') { val = val * 1024; }
    if(m[2] == 'G') { val = val * 1024 * 1024; }
  }

  /* linux style */
  m = String(val).match(/^([\d\.]+)([a-z])$/);
  if(m && m[1]) {
    val = Number(m[1]);
    if(m[2] == 'm') { val = val * 1024; }
    if(m[2] == 'g') { val = val * 1024 * 1024; }
  }
  if(!String(val).match(/^[\d\.]*$/)) {
    throw new Error("normalizeMemVal: cannot handle: "+val+"\n"+line);
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
  return val.toFixed(0) + " B";
}

var redraws = 0;
function updateGraph(pid, filter) {
  redraws = 0;
  spawnTop(graphTopOutput, 0.5, pid, undefined, filter);
}

function graphTopOutput(data) {
  var date      = new Date();
  var timestamp = date.getTime();
  var redraw    = false;
  var len       = data.length;

  if(len == 0) {
  /* reset details table */
    var keys = ['user', 'prio', 'nice', 'virt', 'res', 'shr', 's', 'cpu', 'mem', 'time'];
    $(keys).each(function(i, key) {
      $('#'+key).html('');
    });
  }

  if(len == 1) {
    /* single process */
    var row = data[0];

    /* add real data */
    rawdata[0].push([timestamp, row.virt]); // virt
    rawdata[1].push([timestamp, row.res ]); // res
    rawdata[2].push([timestamp, row.shr ]); // shr
    rawdata[3].push([timestamp, row.cpu ]); // cpu

    var ssh = $("#sshhost").val();
    $('#pid').html(row.pid+(ssh ? ' (on '+ssh+')' : ''));
    $('#user').html(row.user);
    $('#prio').html(row.pr);
    $('#nice').html(row.ni);
    $('#virt').html(formatKiB(row.virt)+" ("+row.virt+"KiB)");
    $('#res').html(formatKiB(row.res)+" ("+row.res+"KiB)");
    $('#shr').html(formatKiB(row.shr)+" ("+row.shr+"KiB)");
    $('#s').html(row.s);
    $('#cpu').html(row.cpu+" %");
    $('#mem').html(row.mem+" %");
    $('#time').html(row.time);
    $('#command').html(row.command);

    if(redraws < 10) {
      /* show required rows */
      var keys = ['pid', 'user', 'prio', 'nice', 's', 'mem', 'time', 'command', 'virt', 'shr'];
      $(keys).each(function(i, key) {
        $('#'+key).parent().show();
      });
      var keys = ['filter'];
      if(curSyntax == 1) { keys = keys.concat(['virt', 'shr', 'prio', 'nice', 'mem']); }
      $(keys).each(function(i, key) {
        $('#'+key).parent().hide();
      });
    }

    redraw = true;
  }
  else if(lastFilter != undefined) {
    /* multiple processes */
    var pattern = new RegExp(lastFilter, 'i');
    /* count totals */
    var virt = 0, res = 0, shr = 0, cpu = 0, num = 0;
    for(var i=0; i<len; i++) {
      var row = data[i];
      if(row.line.match(pattern)) {
        virt += Number(row.virt);
        res  += Number(row.res);
        shr  += Number(row.shr);
        cpu  += Number(row.cpu);
        num++;
      }
    }

    /* add real data */
    rawdata[0].push([timestamp, virt]); // virt
    rawdata[1].push([timestamp, res ]); // res
    rawdata[2].push([timestamp, shr ]); // shr
    rawdata[3].push([timestamp, cpu ]); // cpu
    rawdata[4].push([timestamp, num ]); // matches

    $('#filter').html(lastFilter+' ('+num+' matches)');
    $('#virt').html(formatKiB(virt)+" ("+virt+"KiB)");
    $('#res').html(formatKiB(res)+" ("+res+"KiB)");
    $('#shr').html(formatKiB(shr)+" ("+shr+"KiB)");
    $('#cpu').html(cpu.toFixed(0)+" %");

    /* hide not required rows */
    if(redraws < 10) {
      var keys = ['pid', 'user', 'prio', 'nice', 's', 'mem', 'time', 'command'];
      if(curSyntax == 1) { keys = keys.concat(['virt', 'shr']); }
      $(keys).each(function(i, key) {
        $('#'+key).parent().hide();
      });
      /* show required rows */
      var keys = ['filter'];
      $(keys).each(function(i, key) {
        $('#'+key).parent().show();
      });
    }

    redraw = true;
  }

  /* slow down graph updates on long running graphs */
  if(redraw) {
    redraws++;
    if(     redraws < 1800) {}
    else if(redraws < 1800 && redraws %  2 != 0) { redraw = false; }
    else if(redraws < 3600 && redraws %  3 != 0) { redraw = false; }
    else if(redraws < 7200 && redraws %  5 != 0) { redraw = false; }
    else if(redraws > 7200 && redraws % 10 != 0) { redraw = false; }
  }

  if(redraw || isZoomed) {
    /* check series visibility */
    drawVisibleSeries();
  }
}

function adjustCpuAxisMaxValue() {
  var newmax = Math.ceil(plot.getYAxes()[0].datamax / 100)*100;
  if(newmax < 100) { newmax = 100; }
  plot.getOptions().yaxes[0].max=newmax;
}

/* draw visible series */
var duplicateData = false;
function drawVisibleSeries() {
  var date      = new Date();
  var timestamp = date.getTime();
  var nextstep  = timestamp - timestamp % 60000 + 60000;

  /* adjust cpu axis */
  adjustCpuAxisMaxValue();

  var curSeries = [series[0], series[1], series[2], series[3], series[4]];
  if(duplicateData && !isZoomed) {
    var last = rawdata[3].length - 1;
    curSeries[0].data.push(rawdata[0][last]);
    curSeries[1].data.push(rawdata[1][last]);
    curSeries[2].data.push(rawdata[2][last]);
    curSeries[3].data.push(rawdata[3][last]);
    curSeries[4].data.push(rawdata[4][last]);
  }
  if(!graphVisibility['virt'])    { curSeries[0] = { label: "virt",    color: '#FFFFFF', data: [[nextstep, undefined]] }; }
  if(!graphVisibility['res'])     { curSeries[1] = { label: "res",     color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['shr'])     { curSeries[2] = { label: "shr",     color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['cpu'])     { curSeries[3] = { label: "cpu",     color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['matches']) { curSeries[4] = { label: "matches", color: '#FFFFFF', data: [] }; }

  /* hide virt and shared on osx */
  if(curSyntax == 1) {
    curSeries = [curSeries[1], curSeries[3], curSeries[4]];
  }

  if(lastFilter == undefined) {
    curSeries.pop();
  }

  /* reduce points to plot */
  var factor = 2;
  var num = Math.ceil(curSeries[0].data.length / plot.width()*factor);
  if(num > 1 && !isZoomed) {
    duplicateData = true;
    num = Math.ceil(rawdata[0].length / plot.width() * factor);
    for(var i=0, len=curSeries.length; i<len; i++) {
      curSeries[i].data = reducePoints(rawdata[curSeries[i].nr], num);
    }
  }
  if(isZoomed) {
    for(var i=0, len=curSeries.length; i<len; i++) {
      curSeries[i].data = rawdata[curSeries[i].nr];
    }
  }

  /* advance to next minute to remove flickering */
  if(curSeries[0] && curSeries[0].data) {
    curSeries[0].data.push([nextstep, undefined]);
  }

  plot.setData(curSeries);
  plot.resize();
  plot.setupGrid();
  plot.draw();

  /* remove pseudo entry */
  if(curSeries[0] && curSeries[0].data) {
    curSeries[0].data.pop();
  }

  /* make legend boxes clickable */
  $('.legendColorBox').click(function() {
    graphVisibility[this.nextSibling.innerHTML] = !graphVisibility[this.nextSibling.innerHTML];
    drawVisibleSeries();
    adjustCpuAxisMaxValue();
    drawVisibleSeries();
  }).addClass("clickable");
  $('TD.legendLabel').css({paddingLeft: "5px"});
}

function reducePoints(listIn, num) {
  var listOut = [listIn[0]];
  var sumA = 0, sumB = 0, count = 0;
  for(var i=1, len=listIn.length; i<len; i++) {
    sumA += Number(listIn[i][0]);
    sumB += Number(listIn[i][1]);
    count++;
    if(count == num) {
      listOut.push([Math.round(sumA/count), Math.round(sumB/count)]);
      sumA = 0, sumB = 0, count = 0;
    }
  }
  if(count > 0) {
    listOut.push([Math.round(sumA/count), Math.round(sumB/count)]);
  }
  return(listOut);
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
