<script>
    import Example from "./Example.svelte";
    
   let examples = [
      {
        title: 'Scatter plot',
        picture: 'scatter_plot',
        route: 'scatter_plot'
      },
      {
        title: 'Punchcard plot',
        picture: 'punchcard_plot',
        route: 'punchcard_plot'
      },
      {
        title: 'Parallel coordinates',
        picture: 'parallel_coordinates',
        route: 'parallel_coordinates'
      },
      {
        title: 'Nesting',
        picture: 'nesting',
        route: 'nesting'
      },
      {
        title: 'Categorical scatterplot',
        picture: 'categorical_scatterplot',
        route: 'categorical_scatterplot'
      },
      {
        title: 'Table',
        picture: 'table',
        route: 'table'
      },
      {
        title: 'Layout',
        picture: 'layout',
        route: 'layout'
      },
      // {
      //   title: 'Callback Example',
      //   picture: 'callback_example',
      //   route: 'callback_example'
      // },
      {
        title: 'Taxonomy Hierarchy',
        picture: 'taxonomy_hier',
        route: 'taxonomy_hier'
      },
      {
        title: 'HR layout',
        picture: 'hr_layout',
        route: 'hr_layout'
      },
      {
        title: 'Penguins parallel coordinates',
        picture: 'penguins_parallel_coord',
        route: 'penguins_parallel_coord'
      },
      {
        title: 'Housing scatter plot',
        picture: 'housing_scatter',
        route: 'housing_scatter'

      },
      {
        title: 'Housing punchcard plot',
        picture: 'housing_punchcard',
        route: 'housing_punchcard'
      },
      {
        title: "Housing nested plot",
        picture: "housing_nesting",
        route: "housing_nesting",
      },
      // {
      //   title: "Housing table",
      //   picture: "Housing table",
      //   route: "housing_table",
      // },
      {
        title: 'Housing treemap',
        picture: 'housing_treemap',
        route: 'housing_treemap'
      },
      {
        title: 'Airport node link diagram',
        picture: 'airport_nodelink',
        route: 'airport_nodelink'
      }
    ];
</script>

<div class="all-examples">
    {#each examples as example}
        <Example {example}/>
    {/each}
</div>

<style>

.all-examples {
    position: fixed;
    z-index: 999;
    background-color: white;
    display: grid;
    grid-template-columns: auto auto auto auto;
    justify-content: space-between;
    gap: 20px;
    height: 800px;
    overflow-y: auto;
    padding: 10px;
}

@media (min-width: 640px) {
    .all-examples {
      max-width: none;
    }
  }

</style>