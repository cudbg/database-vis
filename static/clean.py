import pandas as pd

df = pd.read_csv("melb_data.csv")

df.dropna(inplace=True)

df.to_csv("clean_melb_data.csv")
