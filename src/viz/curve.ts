type Rectangle = { x1: number, y1: number, x2: number, y2: number };

// Function to check if a point (px, py) is inside a given rectangle
function isPointInsideRectangle(px: number, py: number, rect: Rectangle): boolean {
    return rect.x1 <= px && px <= rect.x2 && rect.y1 <= py && py <= rect.y2;
}

// Function to check if a line segment (x1, y1) -> (x2, y2) intersects with a rectangle
function doesLineIntersectRectangle(x1: number, y1: number, x2: number, y2: number, rect: Rectangle): boolean {
    // Check if either end of the line is inside the rectangle
    if (isPointInsideRectangle(x1, y1, rect) || isPointInsideRectangle(x2, y2, rect)) {
        return true;
    }

    // Check for intersection with rectangle edges
    // Rectangle edges: (x1, y1) -> (x2, y1), (x2, y1) -> (x2, y2), etc.
    const rectEdges = [
        { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y1 }, // Top edge
        { x1: rect.x2, y1: rect.y1, x2: rect.x2, y2: rect.y2 }, // Right edge
        { x1: rect.x2, y1: rect.y2, x2: rect.x1, y2: rect.y2 }, // Bottom edge
        { x1: rect.x1, y1: rect.y2, x2: rect.x1, y2: rect.y1 }  // Left edge
    ];

    // Check intersection with each rectangle edge
    for (let edge of rectEdges) {
        if (doLinesIntersect(x1, y1, x2, y2, edge.x1, edge.y1, edge.x2, edge.y2)) {
            return true;
        }
    }

    return false;
}

// Function to check if two line segments (x1, y1) -> (x2, y2) and (x3, y3) -> (x4, y4) intersect
function doLinesIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
    const det = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (det === 0) return false; // Lines are parallel, no intersection

    const lambda = ((x3 - x4) * (y1 - y3) - (y3 - y4) * (x1 - x3)) / det;
    const gamma = ((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / det;

    return (lambda >= 0 && lambda <= 1 && gamma >= 0 && gamma <= 1); // Check if intersection is within the line segments
}

// Function to find the path between the rectangles (avoiding forbidden rectangles)
export function findPath(startRect: Rectangle, endRect: Rectangle, rectangles: Rectangle[]): Rectangle[] {
    const visited: Set<Rectangle> = new Set();
    const queue: Rectangle[] = [startRect];
    const parent: Map<Rectangle, Rectangle | null> = new Map();
    
    visited.add(startRect);

    while (queue.length > 0) {
        const current = queue.shift()!;
        
        if (current === endRect) {
            // Reconstruct the path
            const path: Rectangle[] = [];
            let node: Rectangle | null = endRect;
            while (node !== null) {
                path.unshift(node);
                node = parent.get(node) || null;
            }
            return path;
        }

        // Explore adjacent rectangles
        for (const next of rectangles) {
            if (!visited.has(next) && !doesLineIntersectRectangle(current.x1, current.y1, next.x2, next.y2, next)) {
                visited.add(next);
                parent.set(next, current);
                queue.push(next);
            }
        }
    }

    return []; // No path found
}

// Function to generate a smooth curve connecting the points (using cubic Bezier curves)
export function generateCurve(start: { x: number, y: number }, end: { x: number, y: number }): string {
    // Generate a simple cubic Bezier curve between start and end
    const controlPoint1 = { x: (start.x + end.x) / 2, y: start.y };
    const controlPoint2 = { x: (start.x + end.x) / 2, y: end.y };
    
    return `M ${start.x},${start.y} C ${controlPoint1.x},${controlPoint1.y} ${controlPoint2.x},${controlPoint2.y} ${end.x},${end.y}`;
}

// Function to find all rectangles that contain the start and end points
export function findContainingRectangles(start: { x: number, y: number }, end: { x: number, y: number }, rectangles: Rectangle[]): Rectangle[] {
    const containingRects: Rectangle[] = [];
    for (const rect of rectangles) {
        if (isPointInsideRectangle(start.x, start.y, rect) || isPointInsideRectangle(end.x, end.y, rect)) {
            containingRects.push(rect);
        }
    }
    return containingRects;
}


// Example rectangles and points
const rectangles: Rectangle[] = [
    { x1: 100, y1: 100, x2: 200, y2: 200 },
    { x1: 150, y1: 150, x2: 250, y2: 250 },
    { x1: 200, y1: 200, x2: 300, y2: 300 },
    { x1: 250, y1: 100, x2: 350, y2: 200 },
    { x1: 300, y1: 150, x2: 400, y2: 250 },
    { x1: 400, y1: 200, x2: 500, y2: 300 }
];




export function basicCurve(x1, y1, x2, y2) {
    let p1x = (x2 - x1)/2 + x1
    let p1y = y1
    let p2x = (x2 - x1)/2 + x1
    let p2y = y2
    return { p1x, p1y, p2x, p2y }
}
