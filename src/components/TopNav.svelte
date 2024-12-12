<script lang="ts">
    import AllExamples from "./AllExamples.svelte";
    let previewingExamples = false;

    function previewExamples() {
        previewingExamples = !previewingExamples
    }

</script>
  
<div class="topnav">
    <button id="run">Run</button>
    <button id="examples" on:click={previewExamples}>Examples</button>
    {#if previewingExamples}
        <AllExamples />
    {/if}
</div>

<style>
    .topnav {
        position: relative;
    }
    button {
        color: black;
        text-decoration: none;
    }
    .topnav button:hover {
        background-color: bisque;
    }

</style>
  