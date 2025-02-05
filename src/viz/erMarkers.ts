export const ERMarkers = {
    ONE: 'ONE',
    ZERO: 'ZERO',
    MANY: 'MANY',
  };
  
  /**
   * Insert Crow's Foot Notation markers into the SVG DOM.
   *
   * @param elem
   * @param conf
   */
  export const insertMarkers = function (elem, conf) {
    const defs = elem.append('defs');
  
    // One (|)
    defs.append('marker')
      .attr('id', ERMarkers.ONE)
      .attr('refX', 9)
      .attr('refY', 9)
      .attr('markerWidth', 18)
      .attr('markerHeight', 18)
      .attr('orient', 'auto')
      .append('path')
      .attr('stroke', conf.stroke)
      .attr('fill', 'none')
      .attr('d', 'M9,0 L9,18');
  
    // Zero (O)
    defs.append('marker')
      .attr('id', ERMarkers.ZERO)
      .attr('refX', 9)
      .attr('refY', 9)
      .attr('markerWidth', 18)
      .attr('markerHeight', 18)
      .attr('orient', 'auto')
      .append('circle')
      .attr('stroke', conf.stroke)
      .attr('fill', 'white')
      .attr('cx', 9)
      .attr('cy', 9)
      .attr('r', 6);
  
    // Many (Crow's Foot)
    defs.append('marker')
      .attr('id', ERMarkers.MANY)
      .attr('refX', 9)
      .attr('refY', 9)
      .attr('markerWidth', 18)
      .attr('markerHeight', 18)
      .attr('orient', 'auto')
      .append('path')
      .attr('stroke', conf.stroke)
      .attr('fill', 'none')
      .attr('d', 'M0,18 L9,9 L18,18 M9,9 L9,0');
  
    return;
  };
  
