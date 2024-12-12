import pandas as pd

# Load your CSV file
df = pd.read_csv('airport_merged.csv')

# Take a random 30% sample
df_sampled = df.sample(frac=0.2, random_state=42)  # `random_state` ensures reproducibility

# Save the sampled data to a new CSV file
df_sampled.to_csv('clean_flights.csv', index=False)


