import pandas as pd
df = pd.read_csv("heart_disease.csv")

df_cleaned = df.dropna()

df_cleaned.to_csv('clean_heart_disease.csv', index=False)