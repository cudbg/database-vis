export const store_example_code = {
    "scatter_plot":                 [`const o = { x: {domain: [0,100]}, y: {domain: [0, 100]}};`,
                                    `let v = c.dot("T", {x: 'a', y: 'b', fill: 'black'}, o);`],
    
    "punchcard_plot":               [`let sa = c.linear("sa", "T", "aid")`,
                                    `let sb = c.linear("sb", "T", "bid")`,
                                    `let VT = c.dot("T", { x: sa('aid'), y: sb('bid'), fill:'black'})`,
                                    `let VA = c.text("A", {x: 0, y: sa('aid'), text: 'a'}, {textAnchor: "left"})`,
                                    `let VB = c.text("B", {x: sb('bid'), y: 0, text: 'b'}, {textAnchor: "bottom"})`],

    "parallel_coordinates":         [`const o = { x: {domain: [0,15]}}`,
                                    `let VA = c.dot("A", {x: 0, y: "a"}, o)`,
                                    `let VB = c.dot("B", {x: 10, y: "b"}, o)`,
                                    `let VT = c.link("T", {x1: VA.get("aid", ['x']), y1: VA.get("aid", ['y']), x2: VB.get("bid", ['x']), y2: VB.get("bid", ['y'])})`],
    
    "nesting":                      [`const o = { x: {domain: [0,3]}};`,
                                    `let VB = c.rect("B", { x: 'b', y: 0, w: 10, h: 20, fill:'white', stroke:'black'});`,
                                    `let VA = c.dot("A", { x: 0, y: 'a', fill:'black'}, o);`,
                                    `c.nest(VA, VB, "bid");`],
    
    "categorical_scatterplot":      [`let VB = c.text("B", {x: "bid", text: "b"}, {textAnchor:"bottom"}, { x: {domain: [0,10]} });`,
                                    `let VA = c.dot("A", {x: VB.get("bid",["x"]), y: "a", fill:"black"}, { x: {domain: [0,10]} });`],
                                
    "table":                        [`const o = { x: {domain: [0,10]}};`,
                                    `function adjustPos(x) {
                                        return x + 20
                                    }`,
                                    `let VA = c.text("A", {x: 3, y: 'aid', text: "a"}, o);`,
                                    `let VB = c.text("B", {x: VA.get("bid", ['x'], adjustPos), y: 'bid', text: "b"}, o)`],
    
    "layout":                       [`let rect1 = c.rectX("test", { ...sq("b")('y1', 'y2'), x:'b', stroke:"b", fill:"none" })`,
                                    `let rect2 = c.rect("t1", { ...sq('f')(), stroke: "grey", fill: 'none' }, {axis:null})`,
                                    `let text2 = c.text("t1", { ...sq('f')('x', 'y'), dx:10, text: 'f', fill:'white' }, {axis:null})`,
                            
                                    `let dot1 = c.dot("t1", { x: 'f', ...propY('f')(), fill:'red' })`,
                                    
                                    `c.nest(rect2, rect1, "a")`],
    
    "taxonomy_hier":                [`let tables = await c.hier("species", ["morder", "family", "genus", "specificEpithet"])`,
                                    `let vorder = c.dot("morder", {x: "morder", y: 50}, {y: {range: [0, 100]}})`,
                                    `let vfamily = c.dot("family", {x: "family", y: 150}, {y: {range: [100, 200]}})`,
                                    `let vgenus = c.dot("genus", {x: "genus", y: 250}, {y: {range: [200, 300]}})`,
                                    `let vlink1 = c.link("family", {x1: vorder.get("morder", ["x"]), y1: vorder.get("morder", ["y"]), x2: vfamily.get(["morder", "family"], ["x"]), y2: vfamily.get(["morder", "family"], ["y"]) })`,
                                    `let vlink2 = c.link("genus", {x1: vfamily.get(["morder", "family"], ["x"]), y1: vfamily.get(["morder", "family"], ["y"]), x2: vgenus.get(["morder", "family", "genus"], ["x"]), y2: vgenus.get(["morder", "family", "genus"], ["y"]) })`],

    "hr_layout":                    [`await db.normalizeMany("hrdata", ['DeptID', 'Salary', 'Absences', 'PerformanceScore'].map((a)=>[a]))`,
                                    `let rect1 = c.rect("hrdata_DeptID", { ...eqX("DeptID")(), stroke:"grey", fill:"none" })`,
                                    `let bar1 = c.bar("hrdata", { x: 'Salary', y: 'EmpSatisfaction', fill:'red' })`,
                                    `c.nest(bar1, rect1, "DeptID")`],
    
    "penguins_parallel_coord":      [`await db.normalizeMany("penguins", ['beaklen', 'beakdepth', 'flipperlen', 'mass', 'sex'].map((a)=>[a]))`,
                                    `const o = { x: {domain: [0,50]}}`,
                                    `let sex = c.dot("penguins_sex", { x: 10, y: "sex"}, o)`,
                                    `let beakdepth = c.dot("penguins_beakdepth", { x: 20, y: "beakdepth"}, o)`,
                                    `let beaklen = c.dot("penguins_beaklen", { x: 30, y: "beaklen"}, o)`,
                                    `let mass = c.dot("penguins_mass", { x: 40, y: "mass"}, o)`,

                                    `let vlink1 = c.link("penguins_fact", {x1: sex.get("sex", ['x']), y1: sex.get("sex", ['y']), x2: beakdepth.get("beakdepth", ['x']), y2: beakdepth.get("beakdepth", ['y'])})`,
                                    `let vlink2 = c.link("penguins_fact", {x1: beakdepth.get("beakdepth", ['x']), y1: beakdepth.get("beakdepth", ['y']),  x2: beaklen.get("beaklen", ['x']), y2: beaklen.get("beaklen", ['y'])})`,
                                    `let vlink3 = c.link("penguins_fact", {x1: beaklen.get("beaklen", ['x']), y1: beaklen.get("beaklen", ['y']), x2: mass.get("mass", ['x']), y2: mass.get("mass", ['y'])})`
                                    ],

    "housing_scatter":              [`let vdot = c.dot("housing", {x: 'Lattitude', y: 'Longtitude', r: 'Landsize', fill: "Price"})`],

    "housing_punchcard":            [`await db.normalizeMany("housing",['Rooms','Bathroom'].map((a) => [a]))`,
                                    `let sa = c.linear("room_scale", "housing_fact", "Rooms")`,
                                    `let sb = c.linear("bathroom_scale", "housing_fact", "Bathroom")`,
                                    `let VT = c.dot("housing_fact", { x: sb("Bathroom"), y: sa("Rooms")})`,

                                    `let VA = c.text("housing_Rooms", {x: 0, y: sa("Rooms"), text: "Rooms"}, {textAnchor: "left"})`,
                                    `let VB = c.text("housing_Bathroom", {x: sb("Bathroom"), y: 0, text: "Bathroom"}, {textAnchor: "bottom"})`],

    "housing_nesting":              [`await db.normalize("housing", ['Rooms', 'Price', 'Landsize'], "housing_rooms_price_landsize")`,
                                    `await db.normalize("housing_rooms_price_landsize", ['Rooms'], "housing_rooms", "housing_price_landsize")`,

                                    `let VB = c.rect("housing_rooms", { x: 'Rooms', y: 0, w: 10, h: 20, fill:'white', stroke:'black'})`,
                                    `let VA = c.dot("housing_price_landsize", { x: 'Landsize', y: 'Price', fill:'Price'})`,
                                    `c.nest(VA, VB, "Rooms")`],

    "housing_table":                [`//WORK IN PROGRESS`,
                                    `await db.normalize("housing", ['Price', 'Rooms'], "housing_price_rooms", "tmp0")`,
                                    `await db.normalize("housing_price_rooms",['Price'], "price", "tmp1");`,
                                    `await db.normalize("housing_price_rooms",['Rooms'], "rooms", "tmp2");`,
                                    `const o = { x: {domain: [0,10]}};`,
                                    `let vprice = c.text("price", { y: mgg.id, text:'Price', x: 3}, o);`,
                                    `let vrooms = c.text("rooms", { y: mgg.id, text:'Rooms', x: 5}, o);`
                                    ],
                                
    "housing_treemap":              [`await db.normalize("small_housing", ['Rooms', 'YearBuilt', 'Price'], "housing_room_year_price")`,
                                    `await db.normalize("housing_room_year_price", ['Rooms'], "housing_room", "housing_year_price")`,

                                    `let rect1 = c.rectX("housing_room", { ...sq("Rooms")(), x:'Rooms', stroke: "Rooms", fill:"none" })`,
                                    `let rect2 = c.rectX("housing_room_year_price", { ...sq("YearBuilt")(), x:'YearBuilt', "stroke-width":"1px", stroke: "black", fill:"Price" })`,
                                    `c.nest(rect2, rect1, "Rooms")`],
    
    "airport_nodelink":             [`//TEXT mark shows up but is ridculously small.`,
                                    `//Setting fontsize will break it because we try to store font-size as a column when creating a mark table.`,
                                    `//duckdb doesn't allow columns to have - in them`,

                                    `let VA = c.dot("airports", {x: "latitude", y: "longitude"})`,
                                    `let VT = c.link("routes", {x1: VA.get("ORIGIN", ['x']), y1: VA.get("ORIGIN", ['y']), x2: VA.get("DEST", ['x']), y2: VA.get("DEST", ['y'])})`,
                                    `let vtext_origin = c.text("airports", {x: "latitude", y: "longitude", text: "airport", fill: "red"})`]
}

export const store_example_schema = {
    "scatter_plot":                 [`T( _rav_id int primary key, a int, b int)`],
    "punchcard_plot":               [`A (aid int primary key, a int)`,
                                    `B (bid int primary key, b int)`,
                                    `T (_rav_id int primary key, aid int, bid int, FOREIGN KEY (aid) references A(aid), FOREIGN KEY (bid) references B(bid))`],
    "parallel_coordinates":         [`A (aid int primary key, a int)`,
                                    `B (bid int primary key, b int)`,
                                    `T (_rav_id int primary key, aid int, bid int, FOREIGN KEY (aid) references A(aid), FOREIGN KEY (bid) references B(bid))`,
    ],
    "nesting":                      [`B(bid int primary key, b int)`,`A( _rav_id int primary key, a int, bid int, FOREIGN KEY(bid) references B(bid))`],
    
    "categorical_scatterplot":      [`B(bid int primary key, b int)`,
                                    `A(_rav_id int primary key, a int, bid int, FOREIGN KEY (bid) references B(bid))`],
    
    "table":                        [`A (aid int primary key, a int)`,
                                    `B (bid int primary key, b int, FOREIGN KEY (bid) references A(aid))`],
    
    "layout":                       [`test (a int primary key, b int, c int, d int,_rav_id int unique )`,
                                    `t1 (_rav_id int primary key,a int references test(a), f int)`,],
    
    "callback_example":             [`A (aid int primary key, a int)`,
                                    `B (bid int primary key, b int)`,
                                    `T (aid int, bid int, FOREIGN KEY (aid) references A(aid), FOREIGN KEY (bid) references B(bid))`],

    "taxonomy_hier":                [``],

    "hr_layout":                    [``],
    "penguins_parallel_coord":      [``],
    "housing_scatter":              [`housing(Suburb VARCHAR(50), Address VARCHAR(50), Rooms BIGINT, Type VARCHAR(50), Price DOUBLE, Method VARCHAR(50), SellerG VARCHAR(50), Date DATE, Distance DOUBLE, Postcode DOUBLE, Bedroom2 DOUBLE, Bathroom DOUBLE, Car DOUBLE, Landsize DOUBLE, BuildingArea DOUBLE, YearBuilt DOUBLE, CouncilArea VARCHAR(50), Latitude DOUBLE, Longitude DOUBLE, Regionname VARCHAR(50), Propertycount DOUBLE)`],
    "housing_punchcard":            [`housing(Suburb VARCHAR(50), Address VARCHAR(50), Rooms BIGINT, Type VARCHAR(50), Price DOUBLE, Method VARCHAR(50), SellerG VARCHAR(50), Date DATE, Distance DOUBLE, Postcode DOUBLE, Bedroom2 DOUBLE, Bathroom DOUBLE, Car DOUBLE, Landsize DOUBLE, BuildingArea DOUBLE, YearBuilt DOUBLE, CouncilArea VARCHAR(50), Latitude DOUBLE, Longitude DOUBLE, Regionname VARCHAR(50), Propertycount DOUBLE)`],
    "housing_nesting":              [`housing(Suburb VARCHAR(50), Address VARCHAR(50), Rooms BIGINT, Type VARCHAR(50), Price DOUBLE, Method VARCHAR(50), SellerG VARCHAR(50), Date DATE, Distance DOUBLE, Postcode DOUBLE, Bedroom2 DOUBLE, Bathroom DOUBLE, Car DOUBLE, Landsize DOUBLE, BuildingArea DOUBLE, YearBuilt DOUBLE, CouncilArea VARCHAR(50), Latitude DOUBLE, Longitude DOUBLE, Regionname VARCHAR(50), Propertycount DOUBLE)`],
    "housing_table":                [`housing(Suburb VARCHAR(50), Address VARCHAR(50), Rooms BIGINT, Type VARCHAR(50), Price DOUBLE, Method VARCHAR(50), SellerG VARCHAR(50), Date DATE, Distance DOUBLE, Postcode DOUBLE, Bedroom2 DOUBLE, Bathroom DOUBLE, Car DOUBLE, Landsize DOUBLE, BuildingArea DOUBLE, YearBuilt DOUBLE, CouncilArea VARCHAR(50), Latitude DOUBLE, Longitude DOUBLE, Regionname VARCHAR(50), Propertycount DOUBLE)`],
    "housing_treemap":              [`housing(Suburb VARCHAR(50), Address VARCHAR(50), Rooms BIGINT, Type VARCHAR(50), Price DOUBLE, Method VARCHAR(50), SellerG VARCHAR(50), Date DATE, Distance DOUBLE, Postcode DOUBLE, Bedroom2 DOUBLE, Bathroom DOUBLE, Car DOUBLE, Landsize DOUBLE, BuildingArea DOUBLE, YearBuilt DOUBLE, CouncilArea VARCHAR(50), Latitude DOUBLE, Longitude DOUBLE, Regionname VARCHAR(50), Propertycount DOUBLE)`],
    "airport_nodelink":             [``]
}


export const store_example_data = {
    "scatter_plot":                 [`(0,1,3), (1,2,10), (2, 5, 1), (3, 6, 12), (4, 19, 38), (5, 30, 47), (6, 22, 6), 
                                    (7, 40, 48), (8, 35, 42), (9, 16, 39), (10, 27, 56), (11, 13, 11), (12, 37, 77),
                                    (13, 53, 25), (14, 26, 74), (15, 89, 45), (16, 42, 81), (17, 55, 42), (18, 71, 66), (19, 62, 50)`],

    "punchcard_plot":               [`(16, 900), (11, 650), (6, 400), (1, 150), (14, 800), (9, 550), (4, 300),  (17, 950), (12, 700), 
                                    (7, 450), (2, 200), (15, 850), (10, 600), (5, 350),  (0, 100), (18, 1000), (13, 750), (8, 500), (3, 250)`,

                                    `(12, 800), (5, 450), (0, 100), (14, 900), (7, 550), (2, 200), (16, 1000),  (9, 650), (4, 300), (11, 750), 
                                    (13, 850), (6, 500), (1, 150), (15, 950),  (8, 600), (3, 250), (10, 700)`,

                                    `(0, 2, 5), (1, 12, 3), (2, 1, 7), (3, 0, 8), (4, 8, 7), (5, 10, 4),  (6, 16, 1), (7, 12, 0), 
                                    (8, 9, 6), (9, 13, 7), (10, 3, 9), (11, 3, 13),  (12, 0, 8), (13, 14, 11), (14, 12, 9), (15, 0, 6), 
                                    (16, 8, 6), (17, 18, 4),  (18, 1, 12), (19, 15, 14), (20, 10, 0), (21, 17, 0), (22, 8, 13), 
                                    (23, 6, 2), (24, 16, 12), (25, 14, 0), (26, 0, 13), (27, 14, 10), (28, 2, 15), (29, 10, 11),
                                    (30, 7, 3), (31, 5, 9), (32, 2, 5), (33, 1, 12), (34, 18, 4), (35, 2, 7),  (36, 13, 13), (37, 6, 10), 
                                    (38, 11, 1), (39, 10, 5), (40, 6, 9), (41, 7, 16),  (42, 13, 3), (43, 11, 5), (44, 17, 10), (45, 7, 12), 
                                    (46, 11, 14), (47, 3, 15),  (48, 13, 3), (49, 4, 10)`],

    "parallel_coordinates":         [`(16, 900), (11, 650), (6, 400), (1, 150), (14, 800), (9, 550), (4, 300),  (17, 950), (12, 700), 
                                    (7, 450), (2, 200), (15, 850), (10, 600), (5, 350),  (0, 100), (18, 1000), (13, 750), (8, 500), (3, 250)`,

                                    `(12, 800), (5, 450), (0, 100), (14, 900), (7, 550), (2, 200), (16, 1000),  (9, 650), (4, 300), (11, 750), 
                                    (13, 850), (6, 500), (1, 150), (15, 950),  (8, 600), (3, 250), (10, 700)`,

                                    `(0, 2, 5), (1, 12, 3), (2, 1, 7), (3, 0, 8), (4, 8, 7), (5, 10, 4),  (6, 16, 1), (7, 12, 0), 
                                    (8, 9, 6), (9, 13, 7), (10, 3, 9), (11, 3, 13),  (12, 0, 8), (13, 14, 11), (14, 12, 9), (15, 0, 6), 
                                    (16, 8, 6), (17, 18, 4),  (18, 1, 12), (19, 15, 14), (20, 10, 0), (21, 17, 0), (22, 8, 13), 
                                    (23, 6, 2), (24, 16, 12), (25, 14, 0), (26, 0, 13), (27, 14, 10), (28, 2, 15), (29, 10, 11),
                                    (30, 7, 3), (31, 5, 9), (32, 2, 5), (33, 1, 12), (34, 18, 4), (35, 2, 7),  (36, 13, 13), (37, 6, 10), 
                                    (38, 11, 1), (39, 10, 5), (40, 6, 9), (41, 7, 16),  (42, 13, 3), (43, 11, 5), (44, 17, 10), (45, 7, 12), 
                                    (46, 11, 14), (47, 3, 15),  (48, 13, 3), (49, 4, 10)`],

    "nesting":                      [`(0, 0), (1, 3), (2, 2), (3, 1), (4, 4), (5, 5)`,
                                    `(0, 68, 0), (1, 27, 1), (2, 61, 2), (3, 49, 0), (4, 37, 3), (5, 6, 0), (6, 38, 4), (7, 6, 2), 
                                    (8, 53, 4), (9, 77, 2), (10, 95, 3), (11, 93, 4), (12, 7, 5), (13, 7, 3), (14, 22, 0), (15, 1, 3),
                                    (16, 29, 5), (17, 84, 3), (18, 51, 5), (19, 41, 5), (20, 0, 5), (21, 62, 0), (22, 4, 1), (23, 56, 1),
                                    (24, 46, 1), (25, 69, 0), (26, 67, 0), (27, 98, 2), (28, 2, 4), (29, 69, 4), (30, 50, 2), (31, 11, 4),
                                    (32, 33, 1), (33, 72, 0), (34, 21, 3), (35, 87, 0), (36, 67, 3), (37, 55, 3), (38, 0, 3), (39, 54, 4),
                                    (40, 12, 4), (41, 60, 0), (42, 31, 0), (43, 28, 3), (44, 45, 0), (45, 17, 3), (46, 42, 2), (47, 22, 4),
                                    (48, 32, 1), (49, 7, 0)`],
    
    "categorical_scatterplot":      [`(0, 0), (1, 1), (2, 2), (3, 3), (4, 4), (5, 5)`,
                                    `(0, 68, 0), (1, 27, 1), (2, 61, 2), (3, 49, 0), (4, 37, 3), 
                                    (5, 6, 0), (6, 38, 4), (7, 6, 2), (8, 53, 4), (9, 77, 2), (10, 95, 3), (11, 93, 4), 
                                    (12, 7, 5), (13, 7, 3), (14, 22, 0), (15, 1, 3), (16, 29, 5), (17, 84, 3), (18, 51, 5), 
                                    (19, 41, 5), (20, 0, 5), (21, 62, 0), (22, 4, 1), (23, 56, 1), (24, 46, 1), (25, 69, 0), 
                                    (26, 67, 0), (27, 98, 2), (28, 2, 4), (29, 69, 4), (30, 50, 2), (31, 11, 4), (32, 33, 1), 
                                    (33, 72, 0), (34, 21, 3), (35, 87, 0), (36, 67, 3), (37, 55, 3), (38, 0, 3), (39, 54, 4), 
                                    (40, 12, 4), (41, 60, 0), (42, 31, 0), (43, 28, 3), (44, 45, 0), (45, 17, 3), (46, 42, 2), 
                                    (47, 22, 4), (48, 32, 1), (49, 7, 0)`],

    "table":                        [`(0, 1), (1, 2), (2, 5), (3, 6), (4, 19), (5, 30), (6, 22), (7, 40), (8, 35),
                                    (9, 16), (10, 27), (11, 13), (12, 37), (13, 53), (14, 26), (15, 89), (16, 42),
                                    (17, 55), (18, 71), (19, 62)`,
                                    `(0, 3), (1, 10), (2, 1), (3, 12), (4, 38), (5, 47), (6, 6), (7, 48), (8, 42),
                                    (9, 39), (10, 56), (11, 11), (12, 77), (13, 25), (14, 74), (15, 45), (16, 81),
                                    (17, 42), (18, 66), (19, 50)`],

    "layout":                       [`(1,2,3,100,0), (4,5,6,111,1), (7, 8, 9,132,2), (10, 51, 12,145,3)`,
                                    `(0, 1, 1), (1, 1, 2), (2, 1, 5), 
                                    (3, 4, 2), (4, 4,6), (5, 1, 1), 
                                    (6, 1, 5), (7, 7, 6), (8, 7,2), 
                                    (9, 1, 2), (10, 10, 1), (11, 10, 2), (12, 1,1)`],

    "callback_example":             [`(0, 1), (1, 2), (2, 5), (3, 6), (4, 19), (5, 30), (6, 22), (7, 40), (8, 35),
                                    (9, 16), (10, 27), (11, 13), (12, 37), (13, 53), (14, 26), (15, 89), (16, 42),
                                    (17, 55), (18, 71), (19, 62)`,
                                    `(0, 3), (1, 10), (2, 1), (3, 12), (4, 38), (5, 47), (6, 6), (7, 48), (8, 42),
                                    (9, 39), (10, 56), (11, 11), (12, 77), (13, 25), (14, 74), (15, 45), (16, 81),
                                    (17, 42), (18, 66), (19, 50)`,
                                    `(0, 0), (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6), (7, 7), (8, 8),
                                    (9, 9), (10, 10), (11, 11), (12, 12), (13, 13), (14, 14), (15, 15), (16, 16),
                                    (17, 17), (18, 18), (19, 19)`,],

    "taxonomy_hier":                [``],

    "hr_layout":                    [``],

    "penguins_parallel_coord":      [``],

    "housing_punchcard":            [``],

    "housing_scatter":              [``],

    "housing_nesting":              [``],

    "housing_table":                [``],

    "housing_treemap":              [``],

    "airport_nodelink":             [``],
}

export const store_preloaded_data = ["housing", "penguins", "hr_", "airport", "taxonomy"]

