import random

def generate_punchcard(count):
    tuples_list = []
    for x in range(count):
        y = random.choice(range(100, 601, 50))
        z = int(random.uniform(0.1, 1000))
        tuples_list.append((x, y, z))
    return tuples_list

"""
num_tuples = 50
result = generate_punchcard_tuples(number_of_tuples)
print(result)
"""



def generate_parallel_coord(num_tuples, y_range, z_range):
    y_values = list(range(y_range[0], y_range[1] + 1, 50))
    z_values = list(range(z_range[0], z_range[1] + 1, 50))
    
    y_pool = []
    for y in y_values:
        y_pool.extend([y] * 4)
    

    z_pool = []
    for z in z_values:
        z_pool.extend([z] * 6)
    
    while len(y_pool) < num_tuples:
        y_pool.append(random.choice(y_values))
    
    while len(z_pool) < num_tuples:
        z_pool.append(random.choice(z_values))
    

    random.shuffle(y_pool)
    random.shuffle(z_pool)
    

    tuples_list = []
    for x in range(num_tuples):
        y = y_pool[x]
        z = z_pool[x]
        tuples_list.append((x, y, z))
    
    return tuples_list

"""
num_tuples = 50
y_range = (100, 1000)  # Range for y values
z_range = (100, 1000)  # Range for z values


result = generate_parallel_coord(num_tuples, y_range, z_range)
print(result)
"""


def generate_nested(num_tuples, y_values, z_range):
    tuples_list = []
    for x in range(num_tuples):
        y = random.choice(y_values)
        z = int(random.uniform(z_range[0], z_range[1]))
        tuples_list.append((x, y, z))
    return tuples_list

"""
num_tuples = 50
y_values = [100, 200, 300, 400, 500, 600]
z_range = (0.1, 1000)

result = generate_nested(num_tuples, y_values, z_range)
print(result)
"""


def generate_categorical(num_tuples, y_range, z_range):
    first_set = []
    x_counter = 0
    z_values = [int(random.uniform(z_range[0], z_range[1])) for _ in range(num_tuples)]
    y_values = [int(random.uniform(y_range[0], y_range[1])) for _ in range(num_tuples)]
    
    for y, z in zip(y_values, z_values):
        first_set.append((x_counter, y, z))
        x_counter += 1


    z_to_zid = {}
    second_set = []
    zid_counter = 0
    
    for _, _, z in first_set:
        if z not in z_to_zid:
            z_to_zid[z] = zid_counter
            second_set.append((zid_counter, z))
            zid_counter += 1

    normalized_first_set = [(x, y, z_to_zid[z]) for x, y, z in first_set]

    return normalized_first_set, second_set


num_tuples = 50
y_range = (0, 100)
z_range = (0, 6)

first_set, second_set = generate_categorical(num_tuples, y_range, z_range)

print("First Set (x, y, zid):")
print(first_set)


print("\nSecond Set (zid, z):")
print(second_set)


