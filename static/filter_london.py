import pandas as pd

# Load the CSV file
df = pd.read_csv("london.csv")

# Define the list of cities to filter
cities = ["Middlesex", "Hertfordshire", "Twickenham", "Surrey", "Essex", "Fulham", "Marylebone"]

# Filter the DataFrame
filtered_df = df[df["city"].isin(cities)]

# Display the result
print(filtered_df)

# Optionally, save the filtered results to a new CSV
filtered_df.to_csv("filtered_london.csv", index=False)
