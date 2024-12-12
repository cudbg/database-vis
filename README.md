# PI2 Client Library

This library is written in Typescript and Svelte. It is meant to provide abstractions that are useful across the precision interfaces, PVD, and FIST projects.

See [design docs here](./design.md)


## Setup

    npm install .
    npm run dev

    When everything looks good, you can build a version that could be deployed

    npm run build
    npm run preview


More setup

* Read the [Svelte documentation](https://svelte.dev/docs#before-we-begin)
* Optionally set up [VS Code](https://code.visualstudio.com/) + [Svelte extension](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).

Development notes/links

* When packaging as a module to be imported, the `<tag>` syntax [doesn't work](https://github.com/sveltejs/svelte/issues/6530)



# Configuration File

The high level structure contains three components

        backends: <list of backend specs>
        views: <list of view specs>
        dependencies: <list of data dependency specs>

See [./src/assets/config.yml](./src/assets/config.yml) for an example.

## Backend Specs

Each backend has minimum properties:

        backends:
        - type: duckdb | array | query | overlay | identity | ...
          name: <str used to reference backend in other parts of spec>
          <additional properties>

The following are additional properties specific to each backend:

* duckdb: specify the desired table name and either a URL to a CSV or a string-encoded CSV.

        sources:
        - name: <table name once imported>
          url:  <URL string to a CSV file> or
          csv: <String containing CSV data>

* array: a static table

        data:
        - <attr>: <value>   # each row is a list of attribute value pairs
          <attr>: <value>
          ...
        - ...               # can have multiple rows.

* query

        query: <query string with var(PARAM) syntax> 
        defaults:           # optional.  default values for each param
          param1: <value>
          ...


* overlay, identity have no additional properties
        

## Views

Each view has minimum properties:

        - type: <Name of View Component>
          selector: <DOM selector string passed to document.querySelector()>
          name: <string used to reference this view>
          description: <optional description of component>
          interactions: <one or more interaction specs>
          data: <one or more interaction specs>
          <additional properties directly passed to Component during initialization>


For instance, the following defines a slider that will be rendered in the DOM element with id "slider-div", and when the user changes the slider it will be sent to the overlay backend.   By default, the slider handles will be initialized to "10-20".

        - type: Slider
          name: PlantLate
          selector: "#slider-div"
          description "Slider for Late Planting Period"
          interactions:
          - type: change
            defaults:
              left: 10
              right: 20
            to:
            - backend: overlay
              sum_late:
                left: $left
                right: $right

The following defines a Line chart and specifies that the x and y attributes should be `year` and `max_value`

        - type: Line
          name: "line2"
          selector: "#chart-2"
          xAttr: year
          yAttr: max_value
          data: query1



### Interactions

The `interaction` spec defines the backends or views that this view's interaction is routed to.
We need to specify which interaction, the target, and potentially how the interaction's state should be 
transformed.

        interactions:
        - type: <type of interaction.  should be one exported by View.interactions>
          name: <optional string used to reference this interaction>
          to: <to spec, see below>  # the target that consumes the interaction state.
          defaults: 
            <attr>: <value>   # optional list of attr-val pairs.  
                              # defines the default state of the interaction
                              # for instance, the position of slider handles.
                              # this is different than the data spec below, which would define
                              # the slider's min/max range
                              
The following are different ways to specify the "to" attribute

1. directly specify a single backend, interaction state is directly routed without any transformation

          to: <name of a backend>

2. specify a backend and optionally the schema mapping. We ignore the "backend", "view", and "opts" keys and translate the values into a function over the interaction state as input.   Specifically, any `$name` reference is an accessor of the form `(o)=>o['name']` into the interaction state.  We preserve the structure of the mappings

          to:
          - backend: <name of backend>
            param1: $left + 1       
            param2: $right + $left
            param3:
              nested: $left - 1


          # the above is translated into the nested mappings:
          param1: (o) => o.left + 1
          param2: (o) => o.right + o.left
          param3:
            nested: (o) => o.left - 1


          # given the interaction state { left: 1, right: 10 }, the above would generate
          {
            param1: 2
            param2: 11
            param3:
              nested: 0
          }


          # "*" is a special parameter that means "copy interaction state into the return object"
          # its value can be ignored
          # for instance, consider the following 
          to:
          - backend: <name of backend>
            *: null
            param1: $left + 5
          
          # for the above interaction state, it will generate
          {
            left: 1,
            right: 10,
            param1: 6
          }

3. specify a target view, in which case we create an identity backend that directly forwards the interaction state to the view (after applying any mappings)

        to:
        - backend: <name of target view>
          <attribute mappings>

4. specify a target view's backend, as defined in the config file.  Since backends defined inline may not be named, we specify the 0-indexed offset in the View's `data` spec.  This is a shorthand so the developer doesn't need to specify and name a backend explicitly.

        to:
        - backend: Chart.0
          <attribute mappings>


        # later we may have defined a chart view as followsI
        - type: Line
          name: Chart
          data:
          - query: "SELECT ..."


### Data

The `data` spec defines the list of backends that this view renders. There are many shorthands to specify this:

1. directly specify the backend

        data: <name of backend>
           
2. provide a list of backend names.

        data: 
        - backend: <name of backend>
        - backend: ...

3. provide a full backend spec (see backend specs above)

        data:
        - type: <backend type> 
          <rest of backend spec>

4. provide a shorthand for a query backend

        data:
        - query: "SELECT ...."
          params:
            <attr>: <value>   # optional default parameter values

5. Shorthand for an array

        data:
        - array:
            - <attr-value list>  # row 1
            - ...                # row 2 and on

        # if there's only one backend and it is an static array:
        data:
        - <attr-value list> 
        - ...

6. provide name of an interaction.  Note: should be specified after the spec of the interaction.

        data:
        - interaction: <name of interaction>  


The spec takes an optional `target` attribute that specifies which view function to call when the backend generates data.  By default it is `"render"`, but can be specified if the View exposes other render functions.

    data:
    - backend: overlay
      target: overlay        # calls view.overlay(data, ...)




### The Plot View

The Plot view component is mean to make it easy to create Observable Plot charts.  It takes everything a normal view takes as input, but expects an `options` attribute that contains the Plot options specification that are static (not dependent on any queries or data).    The Plot options can be programatically augmented [by adding layers](./design.md).

For example:

    - type: Plot
      name: bar
      selector: "#bar"
      interactions:
        - type: brushX
          to: Debug
      options:
        color:
          scheme: Tableau10
        x:
          type: linear
          domain: [0, 100]
        height: 200
        marks:
        - type: axisY
          label: Payout

        
## Dependencies

Data dependencies are keyed on a specific attribute in an interaction.   Thus each dependency spec provides the source interaction, an attribute to key on, and target view(s).  

The source can be specified as the name of an interaction defined by a view, or "V.I" where "V" is the view name and "I" is the intearction.  The target can be the name of a view, or a list of views.


        dependencies:
        - source: <name of interaction> | <viewName>.<interaction type>
          attr: <attribute to key on. e.g., left for a slider>
          target: <name of view>

or


        dependencies:
        - source: ...
          attr: ...
          target:
          - <name of view>
          - <name of view>
          - ...





