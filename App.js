import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Alert, ScrollView } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@golf_score_card';

export default function App() {
  const [hole, setHole] = useState(1);
  const [stroke, setStroke] = useState(0);
  const [scores, setScores] = useState(Array(18).fill(0));
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedData !== null) {
          const { savedHole, savedStroke, savedScores } = JSON.parse(savedData);
          setHole(savedHole);
          setStroke(savedStroke);
          setScores(savedScores);
        }
      } catch (e) {
        Alert.alert("エラー", "データの読み込みに失敗しました。");
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const saveData = async () => {
        try {
          const data = {
            savedHole: hole,
            savedStroke: stroke,
            savedScores: scores,
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
          Alert.alert("エラー", "データの保存に失敗しました。");
        }
      };
      saveData();
    }
  }, [hole, stroke, scores, isLoaded]);

  const goToNextHole = () => {
    const newScores = [...scores];
    newScores[hole - 1] = stroke;
    setScores(newScores);

    if (hole < 18) {
      setHole(hole + 1);
      setStroke(0);
    } else {
      Alert.alert("ラウンド終了", "18ホールお疲れ様でした！");
    }
  };

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      setStroke(s => s + 1);
    });

  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      if (stroke > 0) {
        setStroke(s => s - 1);
      } else {
        Alert.alert("打数エラー", "打数は0未満にできません。");
      }
    });

  const flingUp = Gesture.Fling()
    .direction(Directions.UP)
    .onEnd(() => {
      Alert.alert(
        "次のホールへ",
        `ホール${hole}のスコアは ${stroke} です。確定しますか？`,
        [
          { text: "キャンセル", style: "cancel" },
          { text: "OK", onPress: () => goToNextHole() },
        ]
      );
    });
    
  const composedGesture = Gesture.Race(flingRight, flingLeft, flingUp);

  if (!isLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={composedGesture}>
          <SafeAreaView style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.headerText}>Hole: {hole}</Text>
            </View>
            <View style={styles.mainContent}>
              <Text style={styles.strokeCount}>{stroke}</Text>
            </View>
            <View style={styles.footer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scoreCardContainer}>
                {scores.map((score, index) => (
                  <View key={index} style={[styles.scoreCard, hole === index + 1 && styles.currentHoleCard]}>
                    <Text style={styles.holeText}>H{index + 1}</Text>
                    <Text style={styles.scoreText}>{hole === index + 1 ? stroke : score}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </SafeAreaView>
        </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    color: '#000000',
    fontSize: 32,
    fontWeight: 'bold',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strokeCount: {
    color: '#000000',
    fontSize: 200,
    fontWeight: 'bold',
  },
  footer: {
    paddingVertical: 20,
    backgroundColor: '#f0f0f0',
  },
  scoreCardContainer: {
    paddingHorizontal: 10,
  },
  scoreCard: {
    width: 60,
    height: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#cccccc',
  },
  currentHoleCard: {
    borderColor: '#006600',
  },
  holeText: {
    color: '#000000',
    fontSize: 16,
  },
  scoreText: {
    color: '#000000',
    fontSize: 28,
    fontWeight: 'bold',
  },
});