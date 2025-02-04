import dagre from "@dagrejs/dagre"
import * as OPlot from "@observablehq/plot";
import { creator, select } from "d3";

type TaskFunc = (...args: any[]) => Promise<any>

export enum HOOK_PLACE {
    QUERY,
    LAYOUT,
    RENDER,
    CREATE_MARKTABLE,
    COMPOSITE
}

enum STATES {
    PENDING,
    RUNNING,
    COMPLETE,
    FAILED
}

class Task {
    name: string
    output: any
    incoming: Task[]
    outgoing: Task[]
    func: TaskFunc
    state: STATES

    breakpoint: boolean


    constructor(name: string, func: TaskFunc, breakpoint: boolean) {
        this.name = name
        this.incoming = []
        this.outgoing = []
        this.func = func
        this.state = STATES.PENDING

        this.breakpoint = breakpoint
    }

    addIncoming(dependency: any) {
        this.incoming.push(dependency)
    }

    addOutgoing(dest: Task) {
        this.outgoing.push(dest)
    }

    async run(noAuto?) {
        if (this.state === STATES.RUNNING || this.state === STATES.COMPLETE)
            return Promise.resolve()

        let allIncomingComplete = (this.incoming.length == 0 || !this.incoming.some(task => task.state != STATES.COMPLETE))

        if (!allIncomingComplete)
            return Promise.resolve()

        try {
            console.log("running task", this.name)
            this.state = STATES.RUNNING
            this.output = await this.func();
            this.state = STATES.COMPLETE;


            if (noAuto) {
                console.log("noAuto trigger")
                return
            }

            for (let i = 0; i < this.outgoing.length; i++) {
                await this.outgoing[i].run()
            }

            /**
             * TODO: Implement breakpoint code at some point
             */

            //return this.output;
        } catch (error) {
            console.error("error", error)
            this.state = STATES.FAILED
            throw new Error(`Task ${this.name} failed.`);
        }
    }

    getInput() {
        let inputs = []
        for (let i = 0; i < this.incoming.length; i++) {
            if (this.incoming[i] instanceof Task) {
                inputs.push(this.incoming[i].output)
            } else {
                inputs.push(this.incoming[i])
            }
        }
        return inputs
    }

    getOutput() {
        return this.output
    }

    isComplete() {
        return this.state == STATES.COMPLETE
    }
}

export class TaskGraph {
    running: boolean
    markToTasksMap: Map<any, Task[]>
    markDependency: Map<any, Set<any>>
    tasksSorted: boolean
    composite: string



    constructor(running: boolean) {
        this.running = running
        this.markToTasksMap = new Map<any, Task[]>()
        this.markDependency = new Map<any, Set<any>>()
        this.tasksSorted = false
        this.composite = null
    }

    generateNewTaskName(hook_place: HOOK_PLACE, mark, taskName) {
        let tasks = this.markToTasksMap.get(mark)

        let counter = 0
        let newPossibleName = `${taskName}_${counter}`

        while (true) {
            newPossibleName = `${taskName}_${counter}`
            let foundName = tasks.some(task => task.name == newPossibleName)

            if (!foundName)
                break

            counter++
        }
        return newPossibleName
    }

    async addTask(hook_place: HOOK_PLACE, mark, func: TaskFunc, breakpoint) {
        let task: Task = null

        switch (hook_place) {
            case HOOK_PLACE.QUERY: {
                let taskName = `query_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.markToTasksMap.get(mark).push(task)
                break
            }
            case HOOK_PLACE.LAYOUT: {
                let taskName = `layout_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.markToTasksMap.get(mark).push(task)
                break
            }
            case HOOK_PLACE.RENDER: {
                let taskName = `render_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.markToTasksMap.get(mark).push(task)
                break
            }
            case HOOK_PLACE.CREATE_MARKTABLE: {
                let taskName = `marktable_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.markToTasksMap.get(mark).push(task)
                break
            }
            case HOOK_PLACE.COMPOSITE: {
                /**
                 * in this case mark is just a string like er diagram
                 */
                let taskName = "COMPOSITE"
                // if (this.findTask(taskName))
                //     taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.markToTasksMap.get(mark).push(task)
                break
            }
            default: {
                throw new Error("Should never end up here")
            }
        }

        if (!this.running) {
            let res = await task.run()
        }
        return task
    }

    addMark(mark: any) {
        if (!this.markToTasksMap.has(mark)) {
            this.markDependency.set(mark, new Set())
            this.markToTasksMap.set(mark, [])

            if (typeof mark == "string" && mark.includes("COMPOSITE")) {
                this.composite = mark
            }
        }
    }

    findMark(mark) {
        for (let m of this.markToTasksMap.keys()) {
            if (m == mark)
                return true
        }
        return false
    }

    findTask(task: Task | string) {
        for (let [mark, tasks] of this.markToTasksMap.entries()) {
            for (let t of tasks) {
                if (task instanceof Task && task.name == t.name)
                    return t
                if ((typeof(task) == "string") && t.name == task)
                    return t
            }
        }
        return null
    }

    addDependency(dest: any, src: any, markDependency: boolean) {
        if (markDependency) {
            if (!this.findMark(dest) || !this.findMark(src))
                throw new Error("No such mark!")
            this.markDependency.get(src).add(dest)

        } else {
            if (!this.findTask(dest))
                throw new Error("No such destination task")
    
            let srcs = Array.isArray(src) ? src : [src]
    
            for (let i = 0; i < srcs.length; i++) {
                dest.addIncoming(srcs[i])
                if (srcs[i] instanceof Task)
                    srcs[i].addOutgoing(dest)
            }
        }

    }

    topoSortMarks() {
        for (let [mark, dependentMarks] of this.markDependency.entries()) {
            for (let m of dependentMarks.values()) {
                /**
                 * Add a dependency between the very last task of m and the very first task of m
                 */
                let srcTasks = this.markToTasksMap.get(mark)
                let src = srcTasks[srcTasks.length - 1]

                let destTasks = this.markToTasksMap.get(m)
                let dest = destTasks[0]

                this.addDependency(dest, src, false)
            }
        }
        this.tasksSorted = true
    }

    // getLastTask(mark) {
    //     let tasks = this.markToTasksMap.get(mark)
    //     return tasks[tasks.length - 1]
    // }


    getStartingTasks() {
        let result: Task[] = []

        for (let [mark, tasks] of this.markToTasksMap.entries()) {
            for (let task of tasks) {
                if (task.isComplete())
                    continue
                else if (task.incoming.length == 0)
                    result.push(task)
                else if (task.incoming.every((parent) => parent.isComplete()))
                    result.push(task)
            }

        }

        return result
    }


    async execute() {
        if (!this.running)
            return Promise.resolve()

        if (!this.tasksSorted)
            this.topoSortMarks()

        if (this.composite != null) {
            let compositeTask = this.markToTasksMap.get(this.composite)
            let queue = []
            let visited = new Set()
            let adjList = new Map<any, any[]>()
            let indegree = new Map<any, number>()
            let marks = []

            for (let [src, dests] of this.markDependency.entries()) {
                if (dests.has(this.composite)) {
                    visited.add(src)
                    queue.push(src)
                    adjList.set(src, [])
                    indegree.set(src, 0)
                }
            }

            while (queue.length > 0) {
                let curr = queue.shift()
                marks.push(curr)
                for (let [src, dests] of this.markDependency.entries()) {
                    if (dests.has(curr)) {
                        indegree.set(curr, indegree.get(curr) + 1)
                        if (adjList.has(src)) {
                            adjList.get(src).push(curr)
                        } else {
                            adjList.set(src, [curr])
                            indegree.set(src, 0)
                            queue.push(src)
                            visited.add(src)
                        }
                    }
                }
            }

            let ans = []
            queue = []
            for (let [mark, count] of indegree.entries()) {
                if (count == 0) {
                    queue.push(mark)
                }
            }

            while (queue.length > 0) {
                let curr = queue.shift()
                ans.push(curr)
                let ng = adjList.get(curr)
                for (let i = 0; i < ng.length; i++) {
                    indegree.set(ng[i], indegree.get(ng[i]) - 1)
                    if (indegree.get(ng[i]) == 0) {
                        queue.push(ng[i])
                    }
                }
            }

            for (let i = 0; i < ans.length; i++) {
                let curr = ans[i]
                let tasks = this.markToTasksMap.get(curr)

                for (let j = 0; j < tasks.length; j++) {
                    await tasks[j].run(true)
                }
            }

            await compositeTask[0].run()
        }
        let startpoints = this.getStartingTasks()


        console.log("startpoints", startpoints)

        for (let i = 0; i < startpoints.length; i++)
            await startpoints[i].run()
        
    }

    visualize(svg) {
        if (!this.tasksSorted)
            this.topoSortMarks()

        let g = new dagre.graphlib.Graph()

        g.setGraph({})

        g.setDefaultEdgeLabel(function() { return {}; });

        let visited = new Set<Task>()

        for (let [mark, tasks] of this.markToTasksMap.entries()) {
            tasks.forEach(task => {
                if (!visited.has(task)) {
                    visited.add(task)
                    g.setNode(task.name, {label: task.name, width: 100, height: 100})
                    for (let outgoing of task.outgoing) {
                        g.setEdge(task.name, outgoing.name)
                    }
                }
            })
        }

        dagre.layout(g);

        const graphWidth = g.graph().width
        const graphHeight = g.graph().height
        
        const nodes = g.nodes().map(id => {
            const node = g.node(id);
            return { id, x: node.x, y: node.y};
        });

        const edges = g.edges().map(edge => {
            const source = g.node(edge.v);
            const target = g.node(edge.w);
            return {
            x1: source.x, y1: source.y,
            x2: target.x, y2: target.y
            };
        });

        const labels = g.nodes().map(id => {
            const node = g.node(id)
            return {text: id, x: node.x, y: node.y}
        })
        
        let graph = OPlot.plot( {
            marks: [
                OPlot.dot(nodes, {x: "x", y: "y", r: 20, ariaLabel: "id"}),
                OPlot.arrow(edges, {x1: "x1", y1: "y1", x2: "x2", y2: "y2"}),
                OPlot.text(labels, {text: "text", x: "x", y: "y"})
            ]
        })

        select(graph)
            .selectAll(`g[aria-label='y-axis tick']`)
            .style("visibility", "hidden");

        select(graph)
            .selectAll(`g[aria-label='y-axis tick label']`)
            .style("visibility", "hidden");

        select(graph)
            .selectAll(`g[aria-label='x-axis tick']`)
            .style("visibility", "hidden");
              
        select(graph)
                .selectAll(`g[aria-label='x-axis tick label']`)
                .style("visibility", "hidden");
        
        const canvasWidth = 1200
        const canvasHeight = 800

        select(graph)
            .attr("width", canvasWidth)
            .attr("height", canvasHeight)

        let node = select(svg)

        node.style("width", `${canvasWidth}px`)
                .style("height", `${canvasHeight}px`);
        
        let graphCanvas = node.append("svg:g")
                .classed("graphCanvas", true);

        const tooltip = document.createElement("div")
        tooltip.style.position = "absolute";
        tooltip.style.background = "white";
        tooltip.style.border = "1px solid black";
        tooltip.style.borderRadius = "5px";
        tooltip.style.padding = "5px";
        tooltip.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.2)";
        tooltip.style.display = "none";
        tooltip.style.pointerEvents = "none";
        document.body.appendChild(tooltip)

        graph.querySelectorAll("circle")
            .forEach(circle => {
                let correspondingTask = this.findTask(circle.getAttribute("aria-label"))

                const cx = parseFloat(circle.getAttribute("cx"))
                const cy = parseFloat(circle.getAttribute("cy"))


                circle.style.pointerEvents = "all"

                circle.addEventListener("mouseover", function() {
                    tooltip.style.display = "block";
                    tooltip.innerHTML = `<strong>Output:</strong> ${JSON.stringify(correspondingTask.output)}`;

                    const svg = circle.ownerSVGElement;

                    const point = svg.createSVGPoint();
                    point.x = parseFloat(circle.getAttribute("cx"));
                    point.y = parseFloat(circle.getAttribute("cy"));

                    const screenPoint = point.matrixTransform(svg.getScreenCTM());

                    tooltip.style.left = `${screenPoint.x + 10}px`;
                    tooltip.style.top = `${screenPoint.y}px`;

                    circle.style.stroke = "red"
                })
                circle.addEventListener("mouseout", function() {
                    tooltip.style.display = "none"
                    circle.style.stroke = "black"
                })
            });
        
        (graphCanvas.node() as HTMLElement).appendChild(graph);
    }

    getTaskInput(task: Task) {
        if (!this.findTask(task))
            throw new Error(`No task with name ${task.name}`)

        return task.getInput()
    }

    getTaskOutput(task: Task) {
        if (!this.findTask(task))
            throw new Error(`No task with name ${task.name}`)

        return task.getOutput()
    }

    clear() {
        this.markToTasksMap.clear()
        this.markDependency.clear()
        this.tasksSorted = false
    }
}
