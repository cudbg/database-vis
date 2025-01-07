type TaskFunc = (...args: any[]) => Promise<any>

export enum HOOK_PLACE {
    SELECT_QUERY,
    LAYOUT,
    RENDER,
    CREATE_MARKTABLE
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
    incoming: any[]
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

    async run() {
        if (this.state === STATES.RUNNING || this.state === STATES.COMPLETE)
            throw new Error("Task already running or completed!")

        // // Wait for all dependencies to be completed
        // let inputs = []
        // for (let i = 0; i < this.incoming.length; i++) {
        //     /**
        //      * We always assume that dependencies are already computed
        //      */
        //     if (this.incoming[i] instanceof Task)
        //         inputs.push(this.incoming[i].output)
        //     else
        //         inputs.push(this.incoming[i])
        // }

        try {
            this.state = STATES.RUNNING
            this.output = await this.func();
            this.state = STATES.COMPLETE;

            /**
             * TODO: Implement breakpoint code at some point
             */

            return this.output;
        } catch (error) {
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
}

export class TaskGraph {
    running: boolean
    marks: Map<any, Set<Task>>
    markDependency: Map<any, Set<any>>



    constructor(running: boolean) {
        this.running = running
        this.marks = new Map<any, Set<Task>>()
        this.markDependency = new Map<any, Set<any>>()
    }

    generateNewTaskName(hook_place: HOOK_PLACE, mark, taskName) {
        let taskSet = this.marks.get(mark)

        let counter = 0
        let newPossibleName = `${taskName}_${counter}`

        while (true) {
            newPossibleName = `${taskName}_${counter}`
            let availableName = true


            for (let task of taskSet.values()) {
                if (task.name == newPossibleName) {
                    availableName = false
                }
            }
            if (availableName)
                break
            counter++
        }
        return newPossibleName
    }

    async addTask(hook_place: HOOK_PLACE, mark, func: TaskFunc, breakpoint) {
        let task: Task = null

        switch (hook_place) {
            case HOOK_PLACE.SELECT_QUERY: {
                let taskName = `select_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.marks.get(mark).add(task)
                break
            }
            case HOOK_PLACE.LAYOUT: {
                let taskName = `layout_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.marks.get(mark).add(task)
                break
            }
            case HOOK_PLACE.RENDER: {
                let taskName = `render_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.marks.get(mark).add(task)
                break
            }
            case HOOK_PLACE.CREATE_MARKTABLE: {
                let taskName = `create_${mark.marktype}${mark.id}`
                if (this.findTask(taskName))
                    taskName = this.generateNewTaskName(hook_place, mark, taskName)

                task = new Task(taskName, func, breakpoint)
                this.marks.get(mark).add(task)
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
        if (!this.marks.has(mark)) {
            this.markDependency.set(mark, new Set())
            this.marks.set(mark, new Set<Task>())
        }
    }

    findMark(mark) {
        for (let m of this.marks.keys()) {
            if (m == mark)
                return true
        }
        return false
    }

    findTask(task: Task | string) {
        for (let [mark, taskSet] of this.marks.entries()) {
            for (let t of taskSet.values()) {
                if (task instanceof Task && t.name == task.name) {
                    return true
                } else if (typeof(task) == "string" && t.name == task){
                    return true
                }
            }
        }
        return false
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
        let queue: any[] = []
        let result: any[] = []
        let indegree = new Map<any, number>()

        for (let mark of this.markDependency.keys())
            indegree.set(mark, 0)

        for (let [mark, dependentMarks] of this.markDependency.entries()) {
            for (let m of dependentMarks.values())
                indegree.set(m, indegree.get(m) + 1)
        }

        for (let [mark, count] of indegree.entries()){
            if (count == 0)
                queue.push(mark)
        }

        while (queue.length != 0) {
            let curr_mark = queue.shift()
            result.push(curr_mark)

            let neighbors = this.markDependency.get(curr_mark)

            for (let n of neighbors) {
                indegree.set(n, indegree.get(n) - 1)

                if (indegree.get(n) == 0)
                    queue.push(n)
            }
        }

        if (result.length != this.markDependency.size)
            throw new Error("Cycle in graph!")

        return result
    }


    topoSortTasks() {
        let result: Task[] = []


        let sortedMarks = this.topoSortMarks()
        console.log("sortedMarks", sortedMarks)

        for (let i = 0; i < sortedMarks.length; i++) {
            let queue: Task[] = []
            let indegree = new Map<Task, number>()
            let taskSet = this.marks.get(sortedMarks[i])

            for (let task of taskSet)
                indegree.set(task, task.incoming.length)


            for (let [task, count] of indegree.entries()){
                if (count == 0)
                    queue.push(task)
            }

            while (queue.length != 0) {
                let curr_task = queue.shift()
                result.push(curr_task)

                let neighbors = curr_task.outgoing

                for (let i = 0; i < neighbors.length; i++) {
                    let nextPossibleTask = neighbors[i]

                    indegree.set(nextPossibleTask, indegree.get(nextPossibleTask) - 1)

                    if (indegree.get(nextPossibleTask) == 0)
                        queue.push(nextPossibleTask)
                }
            }

        }
        
        console.log("result", result)
        let totalTaskCount = [...this.marks.values()].reduce((sum, set) => sum + set.size, 0)

        if (result.length != totalTaskCount)
            throw new Error("Cycle in graph!")

        return result
    }

    async execute() {
        if (!this.running)
            return Promise.resolve()
        let sortedTasks = this.topoSortTasks()
        for (let i = 0; i < sortedTasks.length; i++) {
            await sortedTasks[i].run()
        }
        //sortedTasks.forEach(task => await task.run())
    }

    visualize() {

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
        this.marks.clear()
        this.markDependency.clear()
    }
}

export let taskGraph = new TaskGraph(true)