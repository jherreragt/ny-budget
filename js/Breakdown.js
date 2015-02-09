app.BreakdownRow = Backbone.Model.extend({
    yearIndex: null
});

app.BreakdownColl = Backbone.Collection.extend({
    setRows: function(year, index){
        console.log("*** in BreakdownColl setRows")
        var self = this;
        var all_nums = []
        var total_app = 0
        var total_exp = 0
        $.each(this.models, function(i, row){
            var query = {}
            query[row.get('type')] = row.get('rowName')
            console.log("  *** call getSummary in .each this.models")
            var summ = collection.getSummary(row.get('type'), query, year)
            row.set(summ);
            row.yearIndex = index;
            all_nums.push(row.get('estimates'));
            all_nums.push(row.get('actuals'));
            total_exp = total_exp + row.get('actuals')
            total_app = total_app + row.get('estimates')
        });
        all_nums = all_nums.filter(Boolean);
        this.maxNum = all_nums.sort(function(a,b){return b-a})[0];
        $.each(this.models, function(i, row){

            var apps = row.get('estimates');
            var exps = row.get('actuals');
            if (isNaN(apps)){apps = 0};
            if (isNaN(exps)){exps = 0};

            var exp_perc = BudgetHelpers.prettyPercent(exps, total_exp);
            var app_perc = BudgetHelpers.prettyPercent(apps, total_app);

            var app_perc_bar = parseFloat((apps/self.maxNum) * 100) + '%';
            var exp_perc_bar = parseFloat((exps/self.maxNum) * 100) + '%';
            row.set({app_perc_bar:app_perc_bar, exp_perc_bar:exp_perc_bar, app_perc:app_perc, exp_perc:exp_perc});
        });
    }
});

// Breakdown Chart view. Does a lot the same kind of things as the main chart view
app.BreakdownSummary = Backbone.View.extend({
    tagName: 'tr',
    className: 'rowId',
    detailShowing: false,
    events: {
        'click .details': 'details'
    },
    initialize: function(){
        this._modelBinder = new Backbone.ModelBinder();
        var self = this;
        this.model.on('change', function(model){
            var sel = '#' + model.get('slug') + '-selected-chart';
            var exp = accounting.unformat(model.get('actuals'));
            var est = accounting.unformat(model.get('estimates'));
            if((exp + est) == 0){
                $(self.el).hide();
                if($(self.el).next().is(':visible')){
                    $(self.el).next().hide();
                }
            } else {
                $(self.el).show();
            }
        });
    },
    render: function(){
        this.$el.html(BudgetHelpers.template_cache('breakdownSummary', {model:this.model}));
        this._modelBinder.bind(this.model, this.el, {
            actuals: {selector: '[name="actuals"]', converter: this.moneyChanger},
            estimates: {selector: '[name="estimates"]', converter: this.moneyChanger},
            app_perc: {selector: '[name=app_perc]'},
            exp_perc: {selector: '[name=exp_perc]'},
            app_perc_bar: {selector: '[name=app_perc_bar]'},
            exp_perc_bar: {selector: '[name=exp_perc_bar]'}
        });
        return this;
    },
    moneyChanger: function(direction, value){
        return BudgetHelpers.convertToMoney(value);
    },
    details: function(e){
        console.log("*** in BreakdownSummary details")
        e.preventDefault();
        if (typeof this.detailView !== 'undefined'){
            this.detailView.undelegateEvents();
        }
        if (this.$el.next().hasClass('expanded-content')){
            this.$el.next().remove();
            this.$el.find('i').attr('class', 'fa fa-caret-right fa-lg fa-fw')
        } else {
            var filter = {};
            var type = this.model.get('type');
            filter[type] = this.model.get('rowName');
            var parent_type = this.model.get('parent_type');
            if(parent_type){
                filter[parent_type] = this.model.get('parent');
            }
            var actuals = [];
            var estimates = [];
            $.each(collection.getYearRange(), function(i, year){
                var exps = collection.where(filter)
                console.log("*** in BreakdownSummary details     calls getChartTotals twice")
                var exp = collection.getChartTotals(expendTitle, exps, year);
                if (exp.length > 1){
                    actuals.push(collection.reduceTotals(exp));
                } else {
                    actuals.push(parseFloat(exp[0]));
                }
                var apps = collection.where(filter);
                var est = collection.getChartTotals(apropTitle, apps, year);
                if (est.length > 1){
                    estimates.push(collection.reduceTotals(est));
                } else {
                    estimates.push(parseFloat(est[0]));
                }
            });

            this.model.allActuals = actuals;
            this.model.allEstimates = estimates;
            this.detailView = new app.BreakdownDetail({model:this.model});
            this.detailView.render().$el.insertAfter(this.$el);
            this.detailView.updateChart();
            this.$el.find('i').attr('class', 'fa fa-caret-down fa-lg fa-fw')

            sel_chart_slug = "#"+this.model.get('slug') + "-selected-chart"
            if(this.model.get('estChange') == null){
                $(sel_chart_slug).parent().find('.sparkline-budgeted').hide()
            }
            else{
                $(sel_chart_slug).parent().find('.sparkline-budgeted').show()
            }
            if(this.model.get('expChange') == null){
                $(sel_chart_slug).parent().find(".sparkline-spent").hide()
            }
            else{
                $(sel_chart_slug).parent().find(".sparkline-spent").show()
            }
        }
    }
})

app.BreakdownDetail = Backbone.View.extend({
    tagName: 'tr',
    className: 'expanded-content',
    chartOpts: window.sparkLineOpts,

    events: {
        'click .breakdown': 'breakdownNav'
    },
    initialize: function(){
        console.log("*** in BreakdownDetail initialize")
        this._modelBinder = new Backbone.ModelBinder();
    },
    render: function(){
        console.log("*** in BreakdownDetail render")
        this.$el.html(BudgetHelpers.template_cache('breakdownDetail', {model: this.model}));
        this._modelBinder.bind(this.model, this.el, {
            prevYearRange: '.prevYearRange',
            expChange: '.expChange',
            estChange: '.estChange'
        });
        return this;
    },

    breakdownNav: function(e){
        console.log("*** in BreakdownDetail breakdownNav")
        var filter = {}
        var typeView = this.model.get('type');
        filter[typeView] = this.model.get('rowName')
        var path = this.model.get('slug');
        if (this.model.get('parent')){
            var hierarchy = collection.hierarchy[collection.topLevelView]
            var type_pos = hierarchy.indexOf(typeView)
            var parent_type = hierarchy[type_pos - 1];
            filter[parent_type] = this.model.get('parent');
            path = BudgetHelpers.convertToSlug(this.model.get('parent')) + '/' + this.model.get('slug')
        }
        collection.updateTables(this.model.get('child'), this.model.get('rowName'), filter, this.model.get('year'));
        document.title = document.title + ' | ' + this.model.get('rowName');
        $('#secondary-title').text(this.model.get('child'));
        var pathStart = null;
        if(collection.topLevelView == 'Function'){
            pathStart = 'function-detail/';
        } else if(collection.topLevelView == 'Fund Type') {
            pathStart = 'fund-type-detail/';
        }
        $('html, body').animate({
            scrollTop: $('#breadcrumbs').offset().top
        });
        if (debugMode == true) {
            console.log('navigating ...')
            console.log(pathStart);
            console.log(path);
            console.log(this.model.get('year'));

        }
        app_router.navigate(pathStart + path + '?year=' + this.model.get('year'));
        collection.mainChartView.updateCrumbs();
    },

    updateChart: function(){
        console.log("*** in BreakdownDetail updateChart")
        if (typeof this.highChart !== 'undefined'){
            delete this.highChart;
        }
        var data = this.model;
        var nom_exps = [];
        var nom_est = [];
        $.each(data.allActuals, function(i, e){
            if (isNaN(e)){
                e = null;
            }
            nom_exps.push(e);
        })
        $.each(data.allEstimates, function(i, e){
            if (isNaN(e)){
                e = null;
            }
            nom_est.push(e);
        });
        var minValuesArray = $.grep(nom_est.concat(nom_exps),
          function(val) { return val != null; });
        if (debugMode == true){
            console.log("minValuesArray");
            console.log(minValuesArray);
        }

        var globalOpts = app.GlobalChartOpts;
        // chart options for detail charts
        this.chartOpts.chart.renderTo = data.get('slug') + "-selected-chart";
        this.chartOpts.chart.marginBottom = 20;
        this.chartOpts.plotOptions.area.pointInterval = globalOpts.pointInterval
        this.chartOpts.plotOptions.area.pointStart = Date.UTC(collection.startYear, 1, 1)
        this.chartOpts.yAxis.min = Math.min.apply( Math, minValuesArray )
        this.chartOpts.plotOptions.series.point.events.click = this.pointClick;
        this.chartOpts.yAxis.title = {  enabled: true,
                                        text: 'Real dollars ('+benchmark+')' }
        var extra_point = {
                y: 0,
                marker: {
                    enabled: false
                },
                enableMouseTracking: false
            }

        // adjust for inflation
        exps = BudgetHelpers.inflationAdjust(nom_exps, inflation_idx, benchmark, startYear);
        est = BudgetHelpers.inflationAdjust(nom_est, inflation_idx, benchmark, startYear);

        // copy over the last actual value as first estimated value, to fill gap in line
        for (var i = 1; i < est.length; i++) {
            if (est[i]!==null && exps[i-1]!==null){
                extra_point['y']= exps[i-1]
                est[i-1] = extra_point
            }
        }

        this.chartOpts.series = [{
            color: globalOpts.apropColor,
            data: est,
            marker: {
              radius: 4,
              symbol: globalOpts.apropSymbol
            },
            name: globalOpts.apropTitle
          }, {
            color: globalOpts.expendColor,
            data: exps,
            marker: {
              radius: 5,
              symbol: globalOpts.expendSybmol
            },
            name: globalOpts.expendTitle
          }]

        this.chartOpts.tooltip = {
            borderColor: "#000",
            formatter: function() {
              year = parseInt(Highcharts.dateFormat("%Y", this.x))
              var year_range = BudgetHelpers.convertYearToRange(year);
            
              // // Use this code to display both series in the tooltip
              // // (for when years have both app & exp data)
              // var s = "<strong>" + year_range + "</strong>";
              // $.each(this.points, function(i, point) {
              //   s += "<br /><span style=\"color: " + point.series.color + "\">" + point.series.name + ":</span> $" + Highcharts.numberFormat(point.y, 0);
              // });
              
              // This only takes one series in the tooltip - makes estimate override expenditure if estimate exists
              // (this is for when app & exp span different years, & is necessary
              // b/c of the hack to fill in the space between apps & exps)
                var series_name;
                $.each(this.points, function(i, point) {
                    s = "<strong>" + year_range + " <span style=\"color: " + point.series.color + "\">" + point.series.name + "</span></strong><br />Real: $" + Highcharts.numberFormat(point.y, 0);
                    series_name = point.series.name;
                });
                var unadjusted = {}
                unadjusted['Actuals'] = BudgetHelpers.unadjustedObj(nom_exps, startYear)
                unadjusted['Estimates'] = BudgetHelpers.unadjustedObj(nom_est, startYear)
                s+= "<br><span style=\"color:#7e7e7e\">Nominal: "+ BudgetHelpers.convertToMoney(unadjusted[series_name][year])+"</span>"
                return s;
            },
            shared: true
        }
        // select current year
        var selectedYearIndex = this.model.get('year') - collection.startYear;
        this.highChart = new Highcharts.Chart(this.chartOpts, function(){
            this.series[0].data[selectedYearIndex].select(true, true);
            this.series[1].data[selectedYearIndex].select(true, true);
        });
    },

    // Handler for the click events on the points on the chart
    pointClick: function(e){
        console.log("*** in BreakdownDetail pointClick")
        $("#readme").fadeOut("fast");
        $.cookie("budgetbreakdownreadme", "read", { expires: 7 });
        var x = this.x,
        y = this.y,
        selected = !this.selected,
        index = this.series.index;
        this.select(selected, false);
        var active_chart;
        $.each($('.budget-chart'), function(i, chart){
          var sel_points = $(chart).highcharts().getSelectedPoints();
          $.each(sel_points, function(i, point){
              point.select(false);
          });
          $.each($(chart).highcharts().series, function(i, serie){
              $(serie.data).each(function(j, point){
                if(x === point.x && point.y != null) {
                  active_chart = chart;
                  point.select(selected, true);
                }
              });
          });
        });
        var clickedYear = new Date(x).getFullYear();
        var yearIndex = this.series.processedYData.indexOf(y);
        var hash = window.location.hash;
        if(hash.indexOf('?') >= 0){
            hash = hash.slice(0, hash.indexOf('?'));
        }
        app_router.navigate(hash + '?year=' + clickedYear);
        collection.updateYear(clickedYear, yearIndex);
        $.each($('.bars').children(), function(i, bar){
            var width = $(bar).text();
            $(bar).css('width', width);
        });
    }
});