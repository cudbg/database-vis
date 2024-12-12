<script>
    import { goto } from "$app/navigation";

    export let example;

    function gotoExample() {
        console.log(example.route)
        goto(`/examples/${example.route}`)
    }
</script>

<div class="example" on:click={gotoExample}>
    <h3>{example.title}</h3>
    <img alt={example.picture} src={`/src/assets/imgs/${example.picture}.png`}/>
</div>

<style>
    h3 {
        font-size: 20px;
    }
</style>

